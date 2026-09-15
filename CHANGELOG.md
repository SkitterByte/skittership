# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.5] - 2026-09-15

### Fixed
- **scripts**: stop reporting an update that did not happen

## [2.0.4] - 2026-09-15

### Added
- **init**: explain the first upgrade where it happens

### Fixed
- **release**: gate approve on the staged status

## [2.0.3] - 2026-09-15

### Added
- **init**: migrate the version hook in place
- **init**: keep managed files you have edited
- **init**: record what each install wrote
- **scripts**: report the commit range a generator used

### Fixed
- **scripts**: stop rewriting released sections
- correct tag range and honour update release flags

## [2.0.2] - 2026-09-15

### Added
- **release**: add npm run approve for staged releases
- **release**: stage releases for 2FA approval

### Fixed
- **scripts**: accept any package manager lockfile
- **release**: resolve a version to its stage-id
- **release**: match repository.url case to the GitHub org
- **release**: let trusted publishing find no credentials

## [2.0.1] - 2026-09-14

### Fixed
- **releases**: order and prune retro sections

## [2.0.0] - 2026-09-14

### Fixed
- **releases**: runnable --retro, guarded version commit
- **commit**: bound commits to an explicit pathspec

## [1.1.0] - 2026-08-04

### Fixed
- ship generators as .cjs and refresh managed scripts on install

## [1.0.0] - 2026-07-13

### Added
- scaffold skittership release installer
