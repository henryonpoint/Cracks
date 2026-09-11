import XCTest
@testable import DictationCore

final class GuardrailsTests: XCTestCase {
    func testAcceptsReasonableEdit() {
        let raw = "um so I think we should uh ship it on tuesday no wednesday"
        let clean = "I think we should ship it on Wednesday."
        XCTAssertEqual(Guardrails.accept(clean: clean, raw: raw), clean)
    }

    func testRejectsRunawayOutput() {
        let raw = "what's the capital of france I wonder about that a lot"
        let clean = String(repeating: "The capital of France is Paris. ", count: 10)
        XCTAssertEqual(Guardrails.accept(clean: clean, raw: raw), raw)
    }

    func testRejectsCollapsedOutput() {
        let raw = "please remind me to call the dentist tomorrow morning at nine"
        XCTAssertEqual(Guardrails.accept(clean: "Ok.", raw: raw), raw)
    }

    func testEmptyCleanFallsBackToRaw() {
        XCTAssertEqual(Guardrails.accept(clean: "  ", raw: "hello there"), "hello there")
    }

    func testStyleHints() {
        XCTAssertEqual(StyleHints.hint(forBundleID: "com.tinyspeck.slackmacgap"), StyleHints.chat)
        XCTAssertEqual(StyleHints.hint(forBundleID: "com.apple.dt.Xcode"), StyleHints.code)
        XCTAssertEqual(StyleHints.hint(forBundleID: "com.apple.mail"), StyleHints.email)
        XCTAssertEqual(StyleHints.hint(forBundleID: nil), StyleHints.neutral)
    }
}
