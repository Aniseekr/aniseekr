// Anitabi serves scene images via its CDN with a `?plan=hXXX` size token —
// `?plan=h160` is the default ~284×160 thumbnail used in lists, maps, and
// card decks (~12 KB). Dropping the param returns the original 1920×1080
// frame (~200 KB). Higher `plan=` values like `h720`/`h1080` are NOT served
// (verified — CDN returns 404). So "go big" means "drop the param".
//
// Use this ONLY for the compare overlay / comparison preview — the one place
// where the user actually frames a real-world shot against the anime still
// and pixelation is visible. Everywhere else keeps the thumbnail.

export function toFullResImageUrl(url: string): string {
  if (!url) return url;
  const idx = url.search(/[?&]plan=/);
  if (idx < 0) return url;
  const sepChar = url[idx];
  const after = url.indexOf('&', idx + 1);
  const tail = after < 0 ? '' : url.slice(after);
  const head = url.slice(0, idx);
  if (sepChar === '?') {
    return tail ? head + '?' + tail.slice(1) : head;
  }
  return head + tail;
}
