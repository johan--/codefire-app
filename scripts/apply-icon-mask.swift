#!/usr/bin/env swift
//
// apply-icon-mask.swift
// Applies the standard macOS squircle (continuous-curvature rounded rect) mask
// to AppIcon1024.png so the icon has transparent corners for Developer ID distribution.
//

import AppKit
import Foundation

let projectDir = URL(fileURLWithPath: #filePath)
    .deletingLastPathComponent()  // scripts/
    .deletingLastPathComponent()  // project root

let iconPath = projectDir.appendingPathComponent("assets/AppIcon1024.png")

guard let image = NSImage(contentsOf: iconPath) else {
    fputs("Error: Could not load \(iconPath.path)\n", stderr)
    exit(1)
}

let pixelSize = 1024
let size: CGFloat = CGFloat(pixelSize)
let cornerRadius: CGFloat = size * 0.2237  // Apple's standard ~22.37% ratio

// Create a bitmap rep at exact pixel dimensions (avoids Retina 2x scaling)
let bitmapRep = NSBitmapImageRep(
    bitmapDataPlanes: nil,
    pixelsWide: pixelSize,
    pixelsHigh: pixelSize,
    bitsPerSample: 8,
    samplesPerPixel: 4,
    hasAlpha: true,
    isPlanar: false,
    colorSpaceName: .deviceRGB,
    bytesPerRow: 0,
    bitsPerPixel: 0
)!
bitmapRep.size = NSSize(width: size, height: size)

let ctx = NSGraphicsContext(bitmapImageRep: bitmapRep)!
NSGraphicsContext.current = ctx
ctx.imageInterpolation = .high
ctx.shouldAntialias = true

// Draw the continuous-curvature rounded rect (squircle) path
let rect = NSRect(x: 0, y: 0, width: size, height: size)
let path = NSBezierPath(roundedRect: rect, xRadius: cornerRadius, yRadius: cornerRadius)
path.addClip()

// Draw the original icon into the clipped region
image.draw(in: rect, from: .zero, operation: .sourceOver, fraction: 1.0)

NSGraphicsContext.current = nil

// Convert to PNG with alpha channel
guard let pngData = bitmapRep.representation(using: .png, properties: [:]) else {
    fputs("Error: Could not generate PNG data\n", stderr)
    exit(1)
}

do {
    try pngData.write(to: iconPath)
    print("Successfully applied squircle mask to \(iconPath.path)")
    print("  Size: \(Int(size))x\(Int(size)), corner radius: \(String(format: "%.1f", cornerRadius))px")
} catch {
    fputs("Error writing file: \(error.localizedDescription)\n", stderr)
    exit(1)
}
