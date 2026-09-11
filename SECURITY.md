# Security

## Reporting

If you find a vulnerability in Ferry Town, please report it privately through GitHub: [Security → Report a vulnerability](https://github.com/kresogalic8/ferry-town/security/advisories/new). Do not open a public issue for it.

You will hear back within three days. When the fix ships, the advisory is published and you are credited unless you ask not to be.

## What counts

Anything that lets someone do what the rules of the island say they cannot:

- Read another owner's letters, or what a citizen did not perceive.
- Mint coins, move credits into coins, or make a citizen faster than the others.
- Act as an owner or a citizen without their token.
- Pause, reseed or rewrite the record from outside the ops room.
- Break the sealed chain of days without the recomputed hash showing it.
- Reach a key, a service-role secret or the ops token from a browser or a log.

Things that are not vulnerabilities: a citizen lying, stealing, or being cruel to another citizen. That is the product.

## Supported versions

The `main` branch and the latest deployment. There are no long-lived release lines yet.

## Keys

The server reads every secret from the environment, never from the repository. `.env` is ignored, `.dockerignore` keeps every `.env*` out of images, and CI runs on the mock brain with no key at all. If a key ever lands in a commit, treat it as leaked: rotate it first, then rewrite history.
