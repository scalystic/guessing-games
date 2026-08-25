// Cover image normalisation — arbitrary source image in, one canonical square
// WebP out.
//
// Every stored cover is the SAME dimensions and format regardless of where it
// came from, because the two sources look nothing alike: iTunes serves a clean
// square JPEG, while a YouTube thumbnail lifted out of an ID3 frame is a 16:9
// PNG anywhere from 47KB to 1.6MB. Normalising at ingest means the serving route
// and the UI never have to care which one a given puzzle got.

import sharp from 'sharp'

/// One size, not a set. The art appears post-resolve in the result panel and the
/// history list; 600px covers a 2x retina render at any size that panel is
/// likely to use, and generating a ladder of widths for a ~30KB image would cost
/// more in complexity than it saves in bytes.
export const ARTWORK_SIZE = 600

/// WebP at q80 lands a 600px cover around 25-45KB — roughly a tenth of the
/// PNG thumbnails currently embedded in the masters, with no visible loss at
/// this size. Universally supported by every browser this app targets.
export const ARTWORK_QUALITY = 80
export const ARTWORK_MIME = 'image/webp'
export const ARTWORK_EXTENSION = 'webp'

export type EncodedArtwork = {
  data: Buffer
  width: number
  height: number
  /// Dimensions of the image we were handed, for the ingest log — it is the
  /// only signal that a source was upscaled rather than downscaled.
  sourceWidth: number | null
  sourceHeight: number | null
}

/// Center-crop to a square and encode.
///
/// `fit: cover` crops rather than letterboxes on purpose. A 16:9 video thumbnail
/// padded to a square would render as a thin strip floating in dead space, which
/// looks broken next to a real album cover; cropping to the middle loses the
/// edges but produces something that sits in the same grid.
export async function encodeArtwork(source: Buffer): Promise<EncodedArtwork> {
  const image = sharp(source, { failOn: 'error' })
  const metadata = await image.metadata()

  const data = await image
    .resize(ARTWORK_SIZE, ARTWORK_SIZE, {
      fit: 'cover',
      position: 'centre',
      // Never scale a small source up to hit the target. An upscaled 300px
      // cover is blurrier than the original and larger on disk; better to store
      // what we actually have and let the UI scale it down.
      withoutEnlargement: true,
    })
    // Flatten onto white before dropping alpha: a transparent PNG thumbnail
    // encoded straight to WebP keeps its alpha, and the result panel draws the
    // cover over a dark surface where transparent pixels read as holes.
    .flatten({ background: '#ffffff' })
    .webp({ quality: ARTWORK_QUALITY, effort: 5 })
    .toBuffer({ resolveWithObject: true })

  return {
    data: data.data,
    width: data.info.width,
    height: data.info.height,
    sourceWidth: metadata.width ?? null,
    sourceHeight: metadata.height ?? null,
  }
}
