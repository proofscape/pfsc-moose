# How to make a release


To begin with,

* You should be on the `main` branch.
* All the changes you want to make it into the release should be committed.
* You should update the `CHANGELOG.md` with an entry for the release you're about to
  make, and commit it.

Edit `package.json`, and remove the `-dev` tag on the version number.

Do an `npm install` so the `package-lock.json` updates accordingly:

    $ npm install

Stage changes and commit, with a simple message stating the version number.
Then add a tag, and push both the branch and the tag to GitHub. For example,

    $ git add .
    $ git commit -m "Version 0.22.11"
    $ git tag v0.22.11
    $ git push
    $ git push origin v0.22.11

Publish to npm:

    $ npm publish

Bump the dev version number. For example, if the release tag was `v0.22.11`, then go
into `package.json` and change the version to `0.22.12-dev`. Finally, do a commit:

    $ git add package.json
    $ git commit -m "Bump dev version"

Finished!
