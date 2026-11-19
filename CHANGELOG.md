# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.0] - 2026-11-19

### Added

- The real-time frequency of the European power grids from open sources,
  without account or key: one device per zone followed (continental Europe,
  Nordic area, Great Britain) with the frequency, the deviation from 50 Hz,
  the grid state (normal, notable, strong, after the ENTSO-E and British
  thresholds), the time of the measurement and the source.
- Two sources for continental Europe (netzfrequenzmessung.de, then
  netzfrequenz.info as a fallback), Statnett for the Nordic area, Elexon BMRS
  for Great Britain; a reading interval from 10 to 60 seconds.
- A "Grid frequency" dashboard widget: frequency, deviation, last hour, grid
  state and source.
- Scene triggers "Frequency beyond the threshold" (threshold and direction
  chosen by the user) and "Frequency back to normal".
- A "Test the sources" button, and the zones without an answering source
  shown on the Configuration screen.
- Every text in English, French, German and Spanish.

[Unreleased]: https://github.com/guim31/gladys-grid-frequency/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/guim31/gladys-grid-frequency/releases/tag/v1.0.0
