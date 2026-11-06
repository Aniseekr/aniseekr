package expo.modules.aniseekr.photoimport

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.DocumentsContract
import android.provider.MediaStore
import androidx.core.content.ContextCompat
import androidx.exifinterface.media.ExifInterface
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.InputStream
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone
import java.util.UUID
import kotlin.concurrent.thread

private const val REQUEST_CODE = 0x5EE4
private const val IMPORT_DIR = "pilgrimage-imports"
private val OFFSET_PATTERN = Regex("^[+-]\\d{2}:\\d{2}$")

/**
 * Import photos *with* the place and time they were taken.
 *
 * The system photo picker strips GPS from every photo it hands out, so an
 * import through it can never tell where a trip photo was taken. The document
 * picker plus ACCESS_MEDIA_LOCATION (asked for in JS) returns the original
 * file. Each pick is copied into the app's documents directory, and its EXIF
 * time and coordinates are read from that copy. Nothing here guesses: a photo
 * without GPS comes back without coordinates.
 */
class PhotoImportModule : Module() {
  private var pending: Pair<Promise, Int>? = null

  override fun definition() = ModuleDefinition {
    Name("AniseekrPhotoImport")

    AsyncFunction("pickPhotos") { max: Int, promise: Promise ->
      if (pending != null) {
        promise.reject("ERR_PHOTO_IMPORT_BUSY", "A photo import is already open", null)
        return@AsyncFunction
      }
      val activity = appContext.currentActivity
      if (activity == null) {
        promise.reject("ERR_PHOTO_IMPORT_NO_ACTIVITY", "No foreground activity", null)
        return@AsyncFunction
      }
      val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
        addCategory(Intent.CATEGORY_OPENABLE)
        type = "image/*"
        putExtra(Intent.EXTRA_ALLOW_MULTIPLE, max > 1)
      }
      pending = promise to max.coerceAtLeast(1)
      activity.startActivityForResult(intent, REQUEST_CODE)
    }

    OnActivityResult { _, payload ->
      if (payload.requestCode != REQUEST_CODE) return@OnActivityResult
      val (promise, max) = pending ?: return@OnActivityResult
      pending = null
      val data = payload.data
      if (payload.resultCode != Activity.RESULT_OK || data == null) {
        promise.resolve(emptyList<Map<String, Any?>>())
        return@OnActivityResult
      }
      val uris = buildList {
        val clip = data.clipData
        if (clip != null) {
          for (i in 0 until clip.itemCount) add(clip.getItemAt(i).uri)
        } else {
          data.data?.let { add(it) }
        }
      }.take(max)
      // Copying a few full-size photos takes a while; keep it off the UI thread.
      thread(name = "aniseekr-photo-import") {
        try {
          promise.resolve(uris.mapNotNull { importOne(it) })
        } catch (error: Exception) {
          promise.reject("ERR_PHOTO_IMPORT", error.message, error)
        }
      }
    }
  }

  private val context
    get() = requireNotNull(appContext.reactContext) { "React context is gone" }

  private fun importOne(uri: Uri): Map<String, Any?>? {
    val resolver = context.contentResolver
    val mime = resolver.getType(uri) ?: "image/jpeg"
    val dir = File(context.filesDir, IMPORT_DIR).apply { mkdirs() }
    val dest = File(dir, "${UUID.randomUUID()}.${extensionFor(mime)}")
    val original = originalMediaUri(uri)
    var fromOriginal = false
    val input: InputStream = original?.let {
      try {
        resolver.openInputStream(it)?.also { fromOriginal = true }
      } catch (_: Exception) {
        null
      }
    } ?: resolver.openInputStream(uri) ?: return null
    input.use { source -> dest.outputStream().use { source.copyTo(it) } }

    val exif = try {
      ExifInterface(dest)
    } catch (_: Exception) {
      null
    }
    val latLong = exif?.latLong?.takeIf { (lat, lon) ->
      lat.isFinite() && lon.isFinite() && !(lat == 0.0 && lon == 0.0)
    }
    return mapOf(
      "uri" to Uri.fromFile(dest).toString(),
      "latitude" to latLong?.get(0),
      "longitude" to latLong?.get(1),
      "takenAt" to exif?.let { takenAt(it) },
      "modifiedAt" to lastModified(uri),
      "originalAccess" to fromOriginal,
    )
  }

  /** The MediaStore item behind a picked document, asking for the unredacted file. */
  private fun originalMediaUri(uri: Uri): Uri? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return null
    val granted = ContextCompat.checkSelfPermission(
      context,
      Manifest.permission.ACCESS_MEDIA_LOCATION
    ) == PackageManager.PERMISSION_GRANTED
    if (!granted) return null
    return try {
      MediaStore.getMediaUri(context, uri)?.let { MediaStore.setRequireOriginal(it) }
    } catch (_: Exception) {
      null
    }
  }

  private fun takenAt(exif: ExifInterface): Long? {
    val raw = exif.getAttribute(ExifInterface.TAG_DATETIME_ORIGINAL)
      ?: exif.getAttribute(ExifInterface.TAG_DATETIME)
      ?: return null
    val offset = exif.getAttribute(ExifInterface.TAG_OFFSET_TIME_ORIGINAL)
      ?: exif.getAttribute(ExifInterface.TAG_OFFSET_TIME)
    val format = SimpleDateFormat("yyyy:MM:dd HH:mm:ss", Locale.US).apply {
      isLenient = false
      // Without an offset tag the camera wrote wall-clock time; the phone's own
      // zone is the best reading of it.
      timeZone = if (offset != null && OFFSET_PATTERN.matches(offset)) {
        TimeZone.getTimeZone("GMT$offset")
      } else {
        TimeZone.getDefault()
      }
    }
    return try {
      format.parse(raw.trim())?.time
    } catch (_: Exception) {
      null
    }
  }

  private fun lastModified(uri: Uri): Long? = try {
    context.contentResolver.query(
      uri,
      arrayOf(DocumentsContract.Document.COLUMN_LAST_MODIFIED),
      null,
      null,
      null
    )?.use { cursor ->
      if (cursor.moveToFirst() && !cursor.isNull(0)) cursor.getLong(0).takeIf { it > 0 } else null
    }
  } catch (_: Exception) {
    null
  }

  private fun extensionFor(mime: String): String = when {
    mime.contains("png") -> "png"
    mime.contains("heic") || mime.contains("heif") -> "heic"
    mime.contains("webp") -> "webp"
    else -> "jpg"
  }
}
