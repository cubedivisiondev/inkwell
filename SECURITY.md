# Security

## Reporting

Report a vulnerability privately through GitHub's advisory form:
https://github.com/cubedivisiondev/inkwell/security/advisories/new

Do not open a public issue for a security report. Expect a first response within
seven days.

## What This Software Handles

INKWELL processes photographs of handwriting, which frequently means signatures.
A signature is a credential. The design follows from that.

**Nothing is uploaded.** The browser tool decodes the image in the tab and
discards it when the tab closes. There is no server, no account, no telemetry,
and no network call of any kind. The command line tool reads and writes local
files only.

**No image data is retained.** Neither entry point writes a cache, a temporary
upload, or a log containing image content. The vector tracer writes one bitmap
into a temporary directory that is removed when tracing completes.

**Outputs are what you asked for.** An extracted mark carries no EXIF from the
source photograph, because the alpha matte is constructed rather than copied.
The source image's location metadata does not travel into the output.

## Dependencies

The browser tool has none. The Python package depends on numpy, Pillow and scipy,
and shells out to `potrace` only when `--trace` is passed. Dependabot alerts are
enabled on this repository.

## Scope

In scope: anything that causes image data to leave the device, code execution
from a crafted image, or a path traversal in output handling.

Out of scope: extraction quality on a difficult photograph, and the documented
limitation that an artifact larger than the smallest real mark defeats
scale-based separation. Both are correctness matters, not security ones.
