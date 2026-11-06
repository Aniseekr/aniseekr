//
//  HybridLookFrameFilter.swift
//  AniseekrCameraLook
//
//  iOS film looks. AVCaptureVideoPreviewLayer has no public filter hook, so a
//  look is shown by tinting camera frames with Core Image and enqueueing them
//  on VisionCamera's FrameRenderer layer (an AVSampleBufferDisplayLayer).
//  Saved photos get the same CIColorMatrix. Colour management is off in both
//  paths, so the matrix runs on the encoded sRGB values exactly as Android's
//  ColorMatrixColorFilter does: preview, photo and Android all agree.
//

import AVFoundation
import CoreImage
import CoreMedia
import Foundation
import Metal
import NitroModules
import UIKit
import VisionCamera

final class HybridLookFrameFilter: HybridLookFrameFilterSpec {
  private let lock = NSLock()
  private var filter: CIFilter?
  private var pool: CVPixelBufferPool?
  private var poolSize: CGSize = .zero
  private weak var configuredLayer: AVSampleBufferDisplayLayer?

  private static let context: CIContext = {
    let options: [CIContextOption: Any] = [
      .workingColorSpace: NSNull(),
      .outputColorSpace: NSNull(),
      .cacheIntermediates: false,
    ]
    if let device = MTLCreateSystemDefaultDevice() {
      return CIContext(mtlDevice: device, options: options)
    }
    return CIContext(options: options)
  }()

  func setMatrix(matrix: [Double]?) throws {
    let next = matrix.flatMap(Self.makeFilter)
    lock.lock()
    filter = next
    lock.unlock()
  }

  func render(frame: any HybridFrameSpec, renderer: any HybridFrameRendererSpec) throws {
    guard let nativeFrame = frame as? any NativeFrame, let sampleBuffer = nativeFrame.sampleBuffer
    else {
      throw RuntimeError.error(withMessage: "The Frame has no valid sample buffer")
    }
    guard let nativeRenderer = renderer as? any NativeFrameRenderer,
      let layer = nativeRenderer.layer as? AVSampleBufferDisplayLayer
    else {
      throw RuntimeError.error(withMessage: "The FrameRenderer has no sample-buffer layer")
    }
    configure(layer)

    lock.lock()
    let filter = self.filter
    lock.unlock()

    let output: CMSampleBuffer
    if let filter, let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) {
      output = try tinted(pixelBuffer, through: filter, timedLike: sampleBuffer)
    } else {
      output = sampleBuffer
    }
    layer.enqueue(output)
    if layer.requiresFlushToResumeDecoding {
      layer.flush()
    }
  }

  func gradeJpeg(path: String, matrix: [Double], quality: Double) throws -> Promise<Double> {
    return Promise.async {
      guard let filter = Self.makeFilter(matrix) else {
        throw RuntimeError.error(withMessage: "Expected 20 matrix values")
      }
      let started = CFAbsoluteTimeGetCurrent()
      let url = URL(fileURLWithPath: path.hasPrefix("file://") ? String(path.dropFirst(7)) : path)
      guard let image = CIImage(contentsOf: url, options: [.applyOrientationProperty: true]) else {
        throw RuntimeError.error(withMessage: "Could not decode \(url.lastPathComponent)")
      }
      filter.setValue(image, forKey: kCIInputImageKey)
      guard let graded = filter.outputImage?.cropped(to: image.extent),
        let colorSpace = image.colorSpace ?? CGColorSpace(name: CGColorSpace.sRGB)
      else {
        throw RuntimeError.error(withMessage: "Could not grade \(url.lastPathComponent)")
      }
      let options: [CIImageRepresentationOption: Any] = [
        CIImageRepresentationOption(rawValue: kCGImageDestinationLossyCompressionQuality as String):
          max(0.01, min(1, quality / 100))
      ]
      guard
        let data = Self.context.jpegRepresentation(
          of: graded, colorSpace: colorSpace, options: options)
      else {
        throw RuntimeError.error(withMessage: "Could not encode \(url.lastPathComponent)")
      }
      try data.write(to: url, options: .atomic)
      return (CFAbsoluteTimeGetCurrent() - started) * 1000
    }
  }

  // MARK: - Private

  private func configure(_ layer: AVSampleBufferDisplayLayer) {
    guard configuredLayer !== layer else { return }
    configuredLayer = layer
    DispatchQueue.main.async {
      // Same framing as the camera preview ("cover").
      layer.videoGravity = .resizeAspectFill
    }
  }

  private func tinted(
    _ pixelBuffer: CVPixelBuffer, through filter: CIFilter, timedLike source: CMSampleBuffer
  ) throws -> CMSampleBuffer {
    let width = CVPixelBufferGetWidth(pixelBuffer)
    let height = CVPixelBufferGetHeight(pixelBuffer)
    let target = try nextBuffer(width: width, height: height)

    let input = CIImage(cvPixelBuffer: pixelBuffer)
    filter.setValue(input, forKey: kCIInputImageKey)
    guard let image = filter.outputImage?.cropped(to: input.extent) else {
      throw RuntimeError.error(withMessage: "Core Image produced no frame")
    }
    Self.context.render(image, to: target, bounds: input.extent, colorSpace: nil)

    var format: CMVideoFormatDescription?
    CMVideoFormatDescriptionCreateForImageBuffer(
      allocator: kCFAllocatorDefault, imageBuffer: target, formatDescriptionOut: &format)
    var timing = CMSampleTimingInfo()
    CMSampleBufferGetSampleTimingInfo(source, at: 0, timingInfoOut: &timing)
    var output: CMSampleBuffer?
    guard let format,
      CMSampleBufferCreateReadyWithImageBuffer(
        allocator: kCFAllocatorDefault, imageBuffer: target, formatDescription: format,
        sampleTiming: &timing, sampleBufferOut: &output) == noErr,
      let output
    else {
      throw RuntimeError.error(withMessage: "Could not wrap the tinted frame")
    }
    if let attachments = CMSampleBufferGetSampleAttachmentsArray(output, createIfNecessary: true),
      CFArrayGetCount(attachments) > 0
    {
      let dict = unsafeBitCast(CFArrayGetValueAtIndex(attachments, 0), to: CFMutableDictionary.self)
      CFDictionarySetValue(
        dict, Unmanaged.passUnretained(kCMSampleAttachmentKey_DisplayImmediately).toOpaque(),
        Unmanaged.passUnretained(kCFBooleanTrue).toOpaque())
    }
    return output
  }

  private func nextBuffer(width: Int, height: Int) throws -> CVPixelBuffer {
    let size = CGSize(width: width, height: height)
    if pool == nil || poolSize != size {
      let attributes: [String: Any] = [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
        kCVPixelBufferWidthKey as String: width,
        kCVPixelBufferHeightKey as String: height,
        kCVPixelBufferIOSurfacePropertiesKey as String: [:],
        kCVPixelBufferMetalCompatibilityKey as String: true,
      ]
      var created: CVPixelBufferPool?
      CVPixelBufferPoolCreate(
        kCFAllocatorDefault, [kCVPixelBufferPoolMinimumBufferCountKey: 3] as CFDictionary,
        attributes as CFDictionary, &created)
      pool = created
      poolSize = size
    }
    var buffer: CVPixelBuffer?
    guard let pool,
      CVPixelBufferPoolCreatePixelBuffer(kCFAllocatorDefault, pool, &buffer) == kCVReturnSuccess,
      let buffer
    else {
      throw RuntimeError.error(withMessage: "Out of preview buffers")
    }
    return buffer
  }

  /// 4×5 row-major matrix (offsets in 0..1) → CIColorMatrix.
  private static func makeFilter(_ m: [Double]) -> CIFilter? {
    guard m.count == 20, let filter = CIFilter(name: "CIColorMatrix") else { return nil }
    func row(_ r: Int) -> CIVector {
      CIVector(
        x: CGFloat(m[r * 5]), y: CGFloat(m[r * 5 + 1]), z: CGFloat(m[r * 5 + 2]),
        w: CGFloat(m[r * 5 + 3]))
    }
    filter.setValue(row(0), forKey: "inputRVector")
    filter.setValue(row(1), forKey: "inputGVector")
    filter.setValue(row(2), forKey: "inputBVector")
    filter.setValue(row(3), forKey: "inputAVector")
    filter.setValue(
      CIVector(x: CGFloat(m[4]), y: CGFloat(m[9]), z: CGFloat(m[14]), w: CGFloat(m[19])),
      forKey: "inputBiasVector")
    return filter
  }
}
