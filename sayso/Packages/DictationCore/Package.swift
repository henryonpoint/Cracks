// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "DictationCore",
    platforms: [.macOS("26.0"), .iOS("26.0")],
    products: [
        .library(name: "DictationCore", targets: ["DictationCore"]),
    ],
    targets: [
        .target(name: "DictationCore"),
        .testTarget(name: "DictationCoreTests", dependencies: ["DictationCore"]),
    ],
    swiftLanguageModes: [.v5]
)
