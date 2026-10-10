import { useEffect, useRef, useState } from "react";

function cameraSupport() {
  if (typeof window === "undefined") return { ok: false, reason: "" };
  if (!("BarcodeDetector" in window)) {
    return { ok: false, reason: "This browser can't read barcodes from the camera, so type the number instead." };
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return { ok: false, reason: "No camera access here, so type the number instead." };
  }
  return { ok: true, reason: "" };
}

export default function BarcodeScanner({ onCode, busy }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const [manual, setManual] = useState("");
  const [cameraError, setCameraError] = useState("");
  const [cameraOn, setCameraOn] = useState(false);
  const [support] = useState(cameraSupport);

  const stopCamera = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  };

  useEffect(() => stopCamera, []);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") stopCamera();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, []);

  const startCamera = async () => {
    setCameraError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      streamRef.current = stream;
      setCameraOn(true);
      await new Promise((r) => requestAnimationFrame(r));
      const video = videoRef.current;
      if (!video) {
        stopCamera();
        return;
      }
      video.srcObject = stream;
      await video.play();
      const detector = new window.BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e"] });
      const tick = async () => {
        if (!videoRef.current || !streamRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          if (codes.length > 0) {
            stopCamera();
            try {
              navigator.vibrate?.(30);
            } catch {
              /* vibration blocked */
            }
            onCode(codes[0].rawValue);
            return;
          }
        } catch {
          /* frame not ready */
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (e) {
      stopCamera();
      setCameraError(
        e?.name === "NotAllowedError"
          ? "Camera permission was denied. Allow it in settings, or type the number below."
          : "Couldn't start the camera. Type the number below."
      );
    }
  };

  return (
    <div>
      {support.ok ? (
        <>
          {!cameraOn && (
            <button type="button" className="bigbtn" onClick={startCamera} disabled={busy}>
              Start camera
            </button>
          )}
          {cameraOn && (
            <div className="camwrap">
              <video ref={videoRef} playsInline muted className="camvideo" aria-label="Camera preview" />
              <button type="button" className="linkbtn" onClick={stopCamera}>
                Stop camera
              </button>
            </div>
          )}
          {cameraError && <p className="warn">{cameraError}</p>}
        </>
      ) : (
        <p className="hint small">{support.reason}</p>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (manual.trim()) onCode(manual.trim());
        }}
      >
        <label className="flabel" htmlFor="barcode-manual">
          {support.ok ? "Or enter the barcode number" : "Barcode number"}
        </label>
        <div className="field inline-field">
          <input
            id="barcode-manual"
            className="input"
            inputMode="numeric"
            enterKeyHint="search"
            autoComplete="off"
            placeholder="e.g. 5000159407236"
            value={manual}
            onChange={(e) => setManual(e.target.value.replace(/[^0-9]/g, ""))}
          />
          <button type="submit" className="bigbtn" disabled={!manual.trim() || busy}>
            Look up
          </button>
        </div>
      </form>
    </div>
  );
}
