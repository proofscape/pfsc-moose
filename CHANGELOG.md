## 0.24.0 (240601)

Breaking Changes:

* Parameter names for transition controls are uniformized to
  lower-camel-case.
* The `view` transition parameter is split into `view` and `viewOpts`.
* The `select` parameter accepts `false` instead of `null`.

Bug Fixes:

* Boxlisting keywords must always have angle brackets.


## 0.23.1 (230425)

Enhancements:

* Support `cloneOf` property for nodes
  ([#2](https://github.com/proofscape/pfsc-moose/pull/2)).

## 0.23.0 (230414)

Enhancements:

* Support listening to mouseover/out on nodes
  ([#1](https://github.com/proofscape/pfsc-moose/pull/1)).
* Add doc ref accessor methods to `Forest`
  ([#1](https://github.com/proofscape/pfsc-moose/pull/1)).

Breaking Changes:

* Update to work with new doc ref system of PISE
  ([#1](https://github.com/proofscape/pfsc-moose/pull/1)).

## 0.22.10 (221108)

Enhancements:

* Upgrade `d3`.
