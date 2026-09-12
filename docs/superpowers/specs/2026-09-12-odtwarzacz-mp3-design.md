# Odtwarzacz MP3 — projekt techniczny

Data: 2026-09-12
Status: zatwierdzony do implementacji (tryb autonomiczny — decyzje podjęte na podstawie wymagań)

## 1. Cel

Desktopowy odtwarzacz plików MP3 dla Windows. Prosty w obsłudze, z playlistami,
ulubionymi, odtwarzaniem całych folderów i 10-pasmowym korektorem graficznym
stylizowanym na wieżę hi-fi z lat 90.

## 2. Wymagania

| # | Wymaganie | Realizacja |
|---|-----------|------------|
| 1 | Tworzenie playlist | Playlisty użytkownika w bocznym panelu, dodawanie/usuwanie/zmiana kolejności utworów |
| 2 | Oznaczanie ulubionych | Przełącznik serca na utworze, wirtualna playlista „Ulubione" |
| 3 | Prosty interfejs | Jedno okno, trzy strefy: biblioteka, lista odtwarzania, panel sterowania |
| 4 | Działa na Windows | Electron, pakiet NSIS + portable przez electron-builder |
| 5 | Odtwarzanie folderu z muzyką | Dodanie folderu skanuje rekurencyjnie, przycisk „Odtwórz folder" kolejkuje całość |
| 6 | Equalizer w stylu wieży z lat 90 | 10 pasm BiquadFilter, presety, analizator widma LED, wskaźniki VU L/R |

## 3. Wybór technologii

Rozważane warianty:

- **Electron + Web Audio API** (wybrany). Web Audio daje 10-pasmowy korektor
  z `BiquadFilterNode` i analizator widma z `AnalyserNode` praktycznie za darmo.
  Estetyka lat 90. to czysty CSS. Node 22 jest już w systemie.
- **C# WPF + NAudio**. Natywny, lekki, ale korektor i analizator wymagają
  ręcznej implementacji DSP i FFT. Znacznie więcej kodu.
- **Python + Qt**. Odtwarzanie proste, ale korektor per-pasmo wymaga
  zewnętrznego backendu audio. Najsłabsza opcja dla wymagania 6.

Decyzja: Electron. Koszt to rozmiar paczki (~150 MB); zysk to kompletny
łańcuch DSP i swoboda w wyglądzie.

## 4. Architektura

### 4.1 Procesy

```
proces główny (ESM)              proces renderujący (ESM, bez frameworka)
  main.js      okno, cykl życia    app.js        montaż i spięcie modułów
  ipc.js       obsługa kanałów     state.js      stan + subskrypcje
  library.js   skan folderów       player.js     graf audio i transport
  store.js     zapis JSON          equalizer.js  10 pasm + presety
  protocol.js  strumień track://   visualizer.js analizator widma i VU
  preload.cjs  most contextBridge  views/*.js    biblioteka, playlisty, panel
```

Izolacja kontekstu włączona, `nodeIntegration` wyłączone. Renderer nie ma
dostępu do systemu plików — wszystko idzie przez wąskie API z preloadu.

### 4.2 Dostęp do plików audio

Renderer nie może czytać `file://`. Proces główny rejestruje uprzywilejowany
schemat `track://`, który strumieniuje plik przez `net.fetch` z obsługą
żądań zakresowych (przewijanie). Odpowiedź dostaje nagłówek
`Access-Control-Allow-Origin: *`, a element `<audio>` ma `crossOrigin`
ustawione na `anonymous`. Bez tego `MediaElementAudioSourceNode` byłby
„skażony" i analizator zwracałby ciszę.

### 4.3 Graf audio

```
<audio> -> MediaElementSource -> [10 x BiquadFilter] -> preamp (Gain)
                                                          |
                                          +---------------+---------------+
                                          |                               |
                                     Analyser (widmo)            ChannelSplitter
                                          |                          |       |
                                          |                    Analyser L  Analyser R
                                          |                          (wskaźniki VU)
                                          v
                                     destination
```

Pasma: 31, 62, 125, 250, 500, 1k, 2k, 4k, 8k, 16k Hz. Skrajne jako
`lowshelf` i `highshelf`, środkowe jako `peaking` z Q = 1.41. Zakres ±12 dB.
Presety: Flat, Rock, Pop, Jazz, Classical, Dance, Bass Boost, Treble, Vocal, Loudness.

### 4.4 Model danych

Pojedynczy plik `store.json` w katalogu `userData`, zapis atomowy z debounce.

```
{
  version: 1,
  tracks:    { <id>: { id, path, title, artist, album, duration, addedAt } },
  favorites: [ <id> ],
  playlists: [ { id, name, trackIds, createdAt } ],
  folders:   [ <ścieżka> ],
  settings:  { volume, muted, eqEnabled, eqGains, eqPreset, preamp,
               repeat, shuffle, lastTrackId }
}
```

Identyfikator utworu to SHA-1 ścieżki bezwzględnej znormalizowanej do małych
liter. Dzięki temu ulubione i playlisty przeżywają ponowne skanowanie folderu.

## 5. Wygląd

Ciemny panel przedni w kolorze grafitu, wytłoczone przyciski transportu
z angielskimi napisami (PLAY, STOP, PREV, NEXT — tak jak na prawdziwym
sprzęcie), zielono-bursztynowy wyświetlacz LED z przewijanym tytułem,
segmentowy analizator widma z opadającymi znacznikami szczytu, pionowe
suwaki korektora z podziałką. Pozostałe elementy interfejsu po polsku.

## 6. Podział na moduły testowalne

Logika czysta, pokryta testami jednostkowymi (Vitest, środowisko node):

| Moduł | Odpowiedzialność |
|-------|------------------|
| `shared/track-id.js` | ścieżka -> stabilny identyfikator |
| `shared/eq-presets.js` | definicje pasm, presety, ograniczanie wzmocnień |
| `shared/queue-logic.js` | następny/poprzedni indeks przy shuffle i repeat |
| `shared/playlist-model.js` | operacje na playlistach i ulubionych |
| `shared/store-schema.js` | wartości domyślne, normalizacja, migracja |
| `shared/audio-files.js` | rozpoznawanie obsługiwanych rozszerzeń |

Warstwa Electron i rysowanie na canvasie weryfikowane ręcznie przez
uruchomienie aplikacji.

## 7. Poza zakresem

Streaming, biblioteka online, okładki z internetu, edycja tagów,
konwersja formatów, synchronizacja między urządzeniami.
