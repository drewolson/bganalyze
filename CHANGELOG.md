# Changelog

## Unreleased

- Add re-analyze button to re-run analysis at a different ply depth

## v0.5.0

- Store analysis history in a persistent bbolt database
- Add `--datadir` flag to configure the persistent data directory (default: OS config dir)
- Fix board showing swapped checker colors on reject/take moves
- Change severity cutoffs

## v0.4.3

- Consistently cap match length

## v0.4.2

- Consistent coloring of move and alternative errors again

## v0.4.1

- Consistent coloring of move and alternative errors

## v0.4.0

- Change default analysis depth from 3-ply to 2-ply
- Auto-scroll move list to keep selected move visible
- Add circle/square icons represent move errors and cube errors

## v0.3.0

- Add `--gnubgpath` flag to specify the path to gnubg (defaults to finding via PATH)
- Support additional file formats: `.sgf`, `.gam`, `.sgg`, `.tmg`, `.txt` (in addition to `.mat`)
- Add keyboard shortcuts help dialog (press `?` or click the `?` button)

## v0.2.0

- Add `--port` flag to configure the listening port (defaults to 8080)

## v0.1.0

- Initial release
