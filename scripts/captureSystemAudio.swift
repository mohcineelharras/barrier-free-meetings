#!/usr/bin/env swift

import Foundation
import ScreenCaptureKit
import AVFoundation
import Accelerate

// ScreenCaptureKit audio capture helper for macOS 12.3+
// Captures system audio output, converts to 16kHz mono Float32 PCM, writes to stdout
// Usage: swift captureSystemAudio.swift
//        ./captureSystemAudio

let TARGET_SAMPLE_RATE: Double = 16000
let TARGET_CHANNELS: UInt32 = 1

class AudioCapture: NSObject, SCStreamOutput, SCStreamDelegate {
    private var stream: SCStream?
    private var audioConverter: AVAudioConverter?
    private let outputFormat: AVAudioFormat
    private var isRunning = false
    private var totalBytesWritten: Int = 0
    private let startTime = Date()
    
    override init() {
        guard let format = AVAudioFormat(standardFormatWithSampleRate: TARGET_SAMPLE_RATE, channels: TARGET_CHANNELS) else {
            fatalError("Failed to create output audio format")
        }
        self.outputFormat = format
        super.init()
    }
    
    func start() async throws {
        fputs("[captureSystemAudio] Requesting screen content...\n", stderr)
        let content = try await SCShareableContent.current
        guard let display = content.displays.first else {
            throw NSError(domain: "AudioCapture", code: 1, userInfo: [NSLocalizedDescriptionKey: "No display found"])
        }
        
        fputs("[captureSystemAudio] Found display: \(display.displayID)\n", stderr)
        
        let filter = SCContentFilter(display: display, excludingApplications: [], exceptingWindows: [])
        let config = SCStreamConfiguration()
        config.capturesAudio = true
        config.excludesCurrentProcessAudio = false
        // Note: sampleRate and channelCount are hints; actual format comes from CMSampleBuffer
        config.sampleRate = Int(TARGET_SAMPLE_RATE)
        config.channelCount = Int(TARGET_CHANNELS)
        config.minimumFrameInterval = CMTime(value: 1, timescale: 30)
        config.queueDepth = 3
        
        stream = SCStream(filter: filter, configuration: config, delegate: self)
        try stream?.addStreamOutput(self, type: .audio, sampleHandlerQueue: DispatchQueue(label: "audio.capture"))
        
        fputs("[captureSystemAudio] Starting capture...\n", stderr)
        try await stream?.startCapture()
        isRunning = true
        
        fputs("[captureSystemAudio] Capture started successfully\n", stderr)
        
        // Keep running until interrupted
        while isRunning {
            try await Task.sleep(nanoseconds: 100_000_000) // 100ms
        }
    }
    
    func stop() async {
        fputs("[captureSystemAudio] Stopping capture...\n", stderr)
        isRunning = false
        if let stream = stream {
            try? await stream.stopCapture()
        }
        let elapsed = Date().timeIntervalSince(startTime)
        fputs("[captureSystemAudio] Stopped. Wrote \(totalBytesWritten) bytes over \(String(format: "%.1f", elapsed))s\n", stderr)
    }
    
    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .audio else { return }
        guard let buffer = sampleBuffer.dataBuffer else { return }
        
        var lengthAtOffset: Int = 0
        var totalLength: Int = 0
        var dataPointer: UnsafeMutablePointer<Int8>?
        
        let status = CMBlockBufferGetDataPointer(buffer, atOffset: 0, lengthAtOffsetOut: &lengthAtOffset, totalLengthOut: &totalLength, dataPointerOut: &dataPointer)
        guard status == kCMBlockBufferNoErr, let pointer = dataPointer else { return }
        
        guard let formatDescription = sampleBuffer.formatDescription else { return }
        guard let asbdPtr = CMAudioFormatDescriptionGetStreamBasicDescription(formatDescription) else { return }
        let asbd = asbdPtr.pointee
        
        // Log format once
        if totalBytesWritten == 0 {
            fputs("[captureSystemAudio] Input format: \(asbd.mSampleRate)Hz, \(asbd.mChannelsPerFrame)ch, \(asbd.mBitsPerChannel)bit\n", stderr)
        }
        
        let inputData = Data(bytes: pointer, count: totalLength)
        
        // Convert to target format (16kHz mono Float32)
        if let converted = convertAudio(data: inputData, from: asbd) {
            FileHandle.standardOutput.write(converted)
            totalBytesWritten += converted.count
        }
    }
    
    private func convertAudio(data: Data, from asbd: AudioStreamBasicDescription) -> Data? {
        // Create input format
        var inputASBD = asbd
        guard let inputFormat = AVAudioFormat(streamDescription: &inputASBD) else {
            fputs("[captureSystemAudio] Failed to create input format\n", stderr)
            return nil
        }
        
        // Calculate frame capacity
        let bytesPerFrame = Int(asbd.mBytesPerFrame)
        guard bytesPerFrame > 0 else {
            fputs("[captureSystemAudio] Invalid bytes per frame: \(bytesPerFrame)\n", stderr)
            return nil
        }
        let frameCount = UInt32(data.count / bytesPerFrame)
        
        guard let inputBuffer = AVAudioPCMBuffer(pcmFormat: inputFormat, frameCapacity: frameCount) else {
            fputs("[captureSystemAudio] Failed to create input buffer\n", stderr)
            return nil
        }
        inputBuffer.frameLength = frameCount
        
        // Copy raw data into buffer
        data.withUnsafeBytes { rawBuffer in
            guard let sourcePtr = rawBuffer.baseAddress else { return }
            
            if asbd.mFormatFlags & kAudioFormatFlagIsFloat != 0 {
                // Float format
                for ch in 0..<Int(asbd.mChannelsPerFrame) {
                    if let channelData = inputBuffer.floatChannelData?[ch] {
                        let src = sourcePtr.advanced(by: ch * MemoryLayout<Float>.size)
                            .assumingMemoryBound(to: Float.self)
                        for i in 0..<Int(frameCount) {
                            channelData[i] = src[i * Int(asbd.mChannelsPerFrame)]
                        }
                    }
                }
            } else if asbd.mBitsPerChannel == 16 {
                // Int16 format
                for ch in 0..<Int(asbd.mChannelsPerFrame) {
                    if let channelData = inputBuffer.int16ChannelData?[ch] {
                        let src = sourcePtr.advanced(by: ch * MemoryLayout<Int16>.size)
                            .assumingMemoryBound(to: Int16.self)
                        for i in 0..<Int(frameCount) {
                            channelData[i] = src[i * Int(asbd.mChannelsPerFrame)]
                        }
                    }
                }
            } else if asbd.mBitsPerChannel == 32 {
                // Int32 format
                for ch in 0..<Int(asbd.mChannelsPerFrame) {
                    if let channelData = inputBuffer.int32ChannelData?[ch] {
                        let src = sourcePtr.advanced(by: ch * MemoryLayout<Int32>.size)
                            .assumingMemoryBound(to: Int32.self)
                        for i in 0..<Int(frameCount) {
                            channelData[i] = src[i * Int(asbd.mChannelsPerFrame)]
                        }
                    }
                }
            }
        }
        
        // Already in target format?
        if asbd.mSampleRate == TARGET_SAMPLE_RATE && asbd.mChannelsPerFrame == TARGET_CHANNELS && asbd.mFormatFlags & kAudioFormatFlagIsFloat != 0 {
            return data
        }
        
        // Create converter
        if audioConverter == nil {
            audioConverter = AVAudioConverter(from: inputFormat, to: outputFormat)
        }
        guard let converter = audioConverter else {
            fputs("[captureSystemAudio] Failed to create audio converter\n", stderr)
            return nil
        }
        
        // Calculate output frame capacity
        let ratio = TARGET_SAMPLE_RATE / asbd.mSampleRate
        let outputFrameCapacity = AVAudioFrameCount(Double(frameCount) * ratio) + 100
        
        guard let outputBuffer = AVAudioPCMBuffer(pcmFormat: outputFormat, frameCapacity: outputFrameCapacity) else {
            fputs("[captureSystemAudio] Failed to create output buffer\n", stderr)
            return nil
        }
        
        var error: NSError?
        let inputBlock: AVAudioConverterInputBlock = { inNumPackets, outStatus in
            outStatus.pointee = .haveData
            return inputBuffer
        }
        
        converter.convert(to: outputBuffer, error: &error, withInputFrom: inputBlock)
        
        if let error = error {
            fputs("[captureSystemAudio] Conversion error: \(error.localizedDescription)\n", stderr)
            return nil
        }
        
        guard let floatData = outputBuffer.floatChannelData else {
            return nil
        }
        
        let byteCount = Int(outputBuffer.frameLength) * MemoryLayout<Float>.size
        return Data(bytes: floatData[0], count: byteCount)
    }
    
    func stream(_ stream: SCStream, didStopWithError error: Error) {
        fputs("[captureSystemAudio] Stream stopped with error: \(error.localizedDescription)\n", stderr)
        isRunning = false
    }
}

// Handle SIGINT gracefully
let capture = AudioCapture()
let signalSource = DispatchSource.makeSignalSource(signal: SIGINT, queue: .main)
signalSource.setEventHandler {
    Task {
        await capture.stop()
        exit(0)
    }
}
signalSource.resume()

// Run capture
Task {
    do {
        try await capture.start()
    } catch {
        fputs("[captureSystemAudio] Failed to start capture: \(error.localizedDescription)\n", stderr)
        exit(1)
    }
}

// Keep main thread alive
RunLoop.main.run()
