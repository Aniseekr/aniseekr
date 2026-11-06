package expo.modules.aniseekr.cameralook

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.ColorMatrixColorFilter
import android.graphics.Paint
import android.os.SystemClock
import android.view.TextureView
import android.view.View
import android.view.ViewGroup
import android.view.ViewTreeObserver
import android.widget.ImageView
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.views.ExpoView
import java.io.File
import java.util.WeakHashMap

/**
 * Film looks for the camera. One 4×5 colour matrix (offsets in 0..1) is used
 * twice: as a hardware-layer colour filter over the live preview, and to grade
 * the saved JPEG. Both run through Android's ColorMatrixColorFilter, so the
 * saved photo gets the exact tint the viewfinder showed.
 */
class CameraLookModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AniseekrCameraLook")

    View(LookFilterView::class) {
      Prop("matrix") { view: LookFilterView, matrix: List<Double>? ->
        view.setMatrix(matrix)
      }
    }

    /** Grade a JPEG in place. Resolves with the time it took (ms). */
    AsyncFunction("gradeJpeg") { uri: String, matrix: List<Double>, quality: Int ->
      val filter = colorFilterOf(matrix) ?: throw CodedException("ERR_LOOK_MATRIX", "Expected 20 numbers", null)
      val file = File(uri.removePrefix("file://"))
      val started = SystemClock.elapsedRealtime()
      val source = BitmapFactory.decodeFile(file.path)
        ?: throw CodedException("ERR_LOOK_DECODE", "Could not decode ${file.name}", null)
      val graded = Bitmap.createBitmap(source.width, source.height, Bitmap.Config.ARGB_8888)
      Canvas(graded).drawBitmap(source, 0f, 0f, Paint().apply { colorFilter = filter })
      source.recycle()
      val tmp = File(file.parentFile, "${file.name}.look")
      try {
        tmp.outputStream().use { graded.compress(Bitmap.CompressFormat.JPEG, quality.coerceIn(1, 100), it) }
      } finally {
        graded.recycle()
      }
      if (!tmp.renameTo(file)) {
        tmp.copyTo(file, overwrite = true)
        tmp.delete()
      }
      SystemClock.elapsedRealtime() - started
    }
  }
}

/** Android wants the offset column in 0..255. */
internal fun colorFilterOf(matrix: List<Double>?): ColorMatrixColorFilter? {
  if (matrix == null || matrix.size != 20) return null
  val values = FloatArray(20) { i -> (if (i % 5 == 4) matrix[i] * 255.0 else matrix[i]).toFloat() }
  return ColorMatrixColorFilter(values)
}

/**
 * Wraps the camera preview and tints it with the look's colour matrix. The
 * preview is a TextureView, which always draws through its own hardware layer,
 * so the filter goes on that layer's paint (TextureView.setLayerPaint): one GPU
 * pass per frame, no JS. A layer on this wrapper instead would cache the
 * TextureView and show black. Images inside (the lens-switch freeze frame) get
 * the same filter so they match the live preview.
 */
class LookFilterView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private var filter: ColorMatrixColorFilter? = null
  private var layerPaint: Paint? = null
  // Which paint each TextureView already has, so layout passes don't re-apply it.
  private val applied = WeakHashMap<TextureView, Paint?>()
  private val layoutListener = ViewTreeObserver.OnGlobalLayoutListener { applyToChildren() }

  fun setMatrix(matrix: List<Double>?) {
    filter = colorFilterOf(matrix)
    layerPaint = filter?.let { Paint().apply { colorFilter = it } }
    applyToChildren()
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    // The PreviewView swaps its TextureView when the session restarts.
    viewTreeObserver.addOnGlobalLayoutListener(layoutListener)
    applyToChildren()
  }

  override fun onDetachedFromWindow() {
    viewTreeObserver.removeOnGlobalLayoutListener(layoutListener)
    super.onDetachedFromWindow()
  }

  override fun onViewAdded(child: View?) {
    super.onViewAdded(child)
    applyToChildren()
  }

  private fun applyToChildren() {
    apply(this)
  }

  private fun apply(view: View) {
    when (view) {
      is TextureView -> {
        val paint = layerPaint
        if (!applied.containsKey(view) || applied[view] !== paint) {
          view.setLayerPaint(paint)
          applied[view] = paint
        }
      }
      is ImageView -> if (view.colorFilter !== filter) view.colorFilter = filter
      is ViewGroup -> for (i in 0 until view.childCount) apply(view.getChildAt(i))
    }
  }
}
