# Vendored Third-Party-Dateien

Lokal abgelegt, damit das Stück ohne Laufzeit-CDN läuft (Kiosk/Offline).

## `@mediapipe/tasks-vision` 1.0.1
- `vision_bundle.mjs`
- `wasm/vision_wasm_internal.js` · `wasm/vision_wasm_internal.wasm`
- `wasm/vision_wasm_nosimd_internal.js` · `wasm/vision_wasm_nosimd_internal.wasm`

Quelle: <https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/>
Lizenz: Apache License 2.0 — Copyright Google LLC.
<https://github.com/google-ai-edge/mediapipe/blob/master/LICENSE>

## Modell `hand_landmarker.task` (float16, v1)
Quelle: <https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task>
Lizenz: Apache License 2.0 — Copyright Google LLC.
Modellkarte: <https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker>

## Datenschutz
Die Erkennung läuft vollständig im Browser (WASM). Das Kamerabild wird weder
gespeichert noch übertragen — es verlässt das Gerät nie.
