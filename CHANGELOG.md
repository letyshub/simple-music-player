# Dziennik zmian

Wszystkie istotne zmiany w programie trafiają do tego pliku. Treść sekcji
dla danej wersji staje się opisem wydania na GitHubie, więc pisz ją dla osoby,
która zastanawia się, czy warto pobrać aktualizację, a nie dla programisty.

Format oparty na [Keep a Changelog](https://keepachangelog.com/pl/1.1.0/),
numeracja zgodna z [wersjonowaniem semantycznym](https://semver.org/lang/pl/).

## [Nieopublikowane]

### Dodane

- **Eksport na pendrive i odtwarzacze MP3.** Playlistę, ulubione albo
  zaznaczone utwory można skopiować na urządzenie: prawy przycisk myszy na
  liście, „Eksportuj na urządzenie…", wskazanie folderu. Pliki dostają numery
  zachowujące kolejność listy (`01 - Wykonawca - Tytuł.mp3`), więc radia
  samochodowe i odtwarzacze sortujące alfabetycznie grają je we właściwej
  kolejności. Przed startem widać rozmiar eksportu i wolne miejsce, a przy
  ponownym eksporcie kopiowane są tylko brakujące pliki. Nic na urządzeniu
  nie jest usuwane.

## [1.1.1] - 2026-09-14

Pierwsze publiczne wydanie.

### Dodane

- **Odtwarzanie folderu z muzyką.** Wskazany folder jest przeszukiwany razem
  z podfolderami, a z plików odczytywane są tytuł, wykonawca, album i czas
  trwania. Folder albo pojedyncze pliki można też przeciągnąć na okno.
- **Playlisty.** Tworzenie, zmiana nazwy i usuwanie. Utwory dodaje się
  przeciągnięciem z biblioteki na playlistę w panelu bocznym, kolejność
  zmienia się przeciąganiem wewnątrz listy.
- **Ulubione.** Serce przy utworze, a wszystkie oznaczone zbierają się
  w osobnym widoku.
- **Dziesięciopasmowy korektor graficzny** od 31 Hz do 16 kHz, ze wzmocnieniem
  wstępnym, dziesięcioma presetami i przełącznikiem obejścia. Podwójne
  kliknięcie suwaka zeruje pasmo.
- **Analizator widma i wskaźniki wysterowania** dla obu kanałów, stylizowane
  na wieżę hi-fi z lat 90.
- **Wyszukiwanie** po tytule, wykonawcy i albumie, odporne na polskie znaki
  diakrytyczne: wpisanie „zolw" znajdzie „Żółw".
- **Skróty klawiszowe** do odtwarzania, przewijania listy, wyszukiwania
  i korektora.
- Obsługa formatów MP3, M4A, AAC, FLAC, OGG, Opus, WAV i WMA.
- Biblioteka, playlisty, ulubione i ustawienia korektora zapisują się
  automatycznie i wracają po ponownym uruchomieniu.

### Uwagi

- Pliki instalacyjne nie są podpisane cyfrowo, więc przy pierwszym
  uruchomieniu Windows SmartScreen pokaże ostrzeżenie. Sposób obejścia
  opisano w [README](README.md#pobieranie).
