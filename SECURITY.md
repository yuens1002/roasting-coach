# Security policy

## Reporting a vulnerability

Please report security problems privately, not in a public issue. Use GitHub's private
vulnerability reporting: open the repository's **Security** tab and choose **Report a
vulnerability**. The same channel can be used for reports under the
[Code of Conduct](CODE_OF_CONDUCT.md).

Include what you found, how to reproduce it, and what it could affect. You should get a reply
within a week. Please give a reasonable amount of time for a fix before disclosing publicly.

## Scope

roasting-coach is a personal tool that runs locally against your own Postgres database. Reports
that matter most:

- Anything that could leak a user's own data (roast logs, profiles, tasting notes) beyond their
  own machine or database.
- Injection through roast-log or profile files, or through the JSON the commands accept.
- Dependencies with known vulnerabilities (`npm audit`).

## Supported versions

Only the latest commit on `main` is supported.
