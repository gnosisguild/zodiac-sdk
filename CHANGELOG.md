# Changelog

## [1.13.0](https://github.com/gnosisguild/zodiac-sdk/compare/v1.12.2...v1.13.0) (2026-08-18)


### Features

* re-export roles-sdk types and consolidate generated imports ([#46](https://github.com/gnosisguild/zodiac-sdk/issues/46)) ([abe8192](https://github.com/gnosisguild/zodiac-sdk/commit/abe8192ddec7c2d6b513a4ec075ebbf44c4121a2))


### Bug Fixes

* drop registry-url so npm publish reaches the OIDC exchange ([#47](https://github.com/gnosisguild/zodiac-sdk/issues/47)) ([11f556d](https://github.com/gnosisguild/zodiac-sdk/commit/11f556da0458ef37c3b0aad6cc6e88109d9ef572))

## [1.12.2](https://github.com/gnosisguild/zodiac-sdk/compare/v1.12.1...v1.12.2) (2026-08-18)


### Bug Fixes

* publish under the [@zodiaceco](https://github.com/zodiaceco) scope ([#44](https://github.com/gnosisguild/zodiac-sdk/issues/44)) ([ca2dd63](https://github.com/gnosisguild/zodiac-sdk/commit/ca2dd633722765b8d128389390c180533664a778))

## [1.12.1](https://github.com/gnosisguild/zodiac-sdk/compare/v1.12.0...v1.12.1) (2026-07-01)


### Bug Fixes

* adopt @zodiac-os/api-types v4-compatible types (^1.6.2) ([#42](https://github.com/gnosisguild/zodiac-sdk/issues/42)) ([30166d3](https://github.com/gnosisguild/zodiac-sdk/commit/30166d309dfead6c08cab57e8d72ecdc67333550))

## [1.12.0](https://github.com/gnosisguild/zodiac-sdk/compare/v1.11.2...v1.12.0) (2026-07-01)


### Features

* adopt zodiac-roles-sdk v4 (+ CLI pull-flow fixes) ([#40](https://github.com/gnosisguild/zodiac-sdk/issues/40)) ([37cf7d3](https://github.com/gnosisguild/zodiac-sdk/commit/37cf7d34a58b842873e47440b258c5daa012d849))

## [1.11.2](https://github.com/gnosisguild/zodiac-sdk/compare/v1.11.1...v1.11.2) (2026-06-23)


### Bug Fixes

* **cli:** respect ZODIAC_API_URL, make pull primary, bind roles by address ([#38](https://github.com/gnosisguild/zodiac-sdk/issues/38)) ([6f6768b](https://github.com/gnosisguild/zodiac-sdk/commit/6f6768ba1b81cc7a867841366171550cfe891657))

## [1.11.1](https://github.com/gnosisguild/zodiac-sdk/compare/v1.11.0...v1.11.1) (2026-05-13)


### Bug Fixes

* **config:** narrow resolveAbisDir param so callers don't need apiKey ([#35](https://github.com/gnosisguild/zodiac-sdk/issues/35)) ([47ff081](https://github.com/gnosisguild/zodiac-sdk/commit/47ff0816db965391dec30a2ebb53e07d201537a0))

## [1.11.0](https://github.com/gnosisguild/zodiac-sdk/compare/v1.10.0...v1.11.0) (2026-05-13)


### Features

* **cli:** accept zodiac.config.{ts,mts,cts,js,mjs,cjs} ([#32](https://github.com/gnosisguild/zodiac-sdk/issues/32)) ([e728b37](https://github.com/gnosisguild/zodiac-sdk/commit/e728b37ea75cac8813cd7637fa19f1cd0795a412))


### Bug Fixes

* **push:** preserve Record-form roles and allowances ([#34](https://github.com/gnosisguild/zodiac-sdk/issues/34)) ([3239e75](https://github.com/gnosisguild/zodiac-sdk/commit/3239e7598d84886774bdd14b3da8850f19a2d21c))

## [1.10.0](https://github.com/gnosisguild/zodiac-sdk/compare/v1.9.0...v1.10.0) (2026-05-12)


### Features

* **cli:** auto-create zodiac.config.ts at project root on first run ([#30](https://github.com/gnosisguild/zodiac-sdk/issues/30)) ([8c32ae1](https://github.com/gnosisguild/zodiac-sdk/commit/8c32ae1909f1626a671b5f205e0e02f4dcf92d6b))

## [1.9.0](https://github.com/gnosisguild/zodiac-sdk/compare/v1.8.0...v1.9.0) (2026-05-12)


### Features

* **cli:** PKCE auth-code flow for zodiac init ([#27](https://github.com/gnosisguild/zodiac-sdk/issues/27)) ([161861f](https://github.com/gnosisguild/zodiac-sdk/commit/161861f4e505537ca82e0def59dfe6e01bc8459d))

## [1.8.0](https://github.com/gnosisguild/zodiac-sdk/compare/v1.7.1...v1.8.0) (2026-05-11)


### Features

* **cli:** zodiac init — browser-flow API key setup ([#25](https://github.com/gnosisguild/zodiac-sdk/issues/25)) ([d51525f](https://github.com/gnosisguild/zodiac-sdk/commit/d51525fdd146f807da044ab5917314a03043c3eb))

## [1.7.1](https://github.com/gnosisguild/zodiac-sdk/compare/v1.7.0...v1.7.1) (2026-04-28)


### Bug Fixes

* **cli:** update pull-org description to mention accounts (not vaults) ([#23](https://github.com/gnosisguild/zodiac-sdk/issues/23)) ([81ed2f7](https://github.com/gnosisguild/zodiac-sdk/commit/81ed2f71523a8eba1c84828cffe210fab4125ca9))

## [1.7.0](https://github.com/gnosisguild/zodiac-sdk/compare/v1.6.1...v1.7.0) (2026-04-28)


### Features

* unified accounts API + push() rename ([#20](https://github.com/gnosisguild/zodiac-sdk/issues/20)) ([5280a85](https://github.com/gnosisguild/zodiac-sdk/commit/5280a853b8095d5b4fa983671d82e3784823461a))

## [1.6.1](https://github.com/gnosisguild/zodiac-sdk/compare/v1.6.0...v1.6.1) (2026-04-20)


### Bug Fixes

* codegen output dir ([#17](https://github.com/gnosisguild/zodiac-sdk/issues/17)) ([ae883b1](https://github.com/gnosisguild/zodiac-sdk/commit/ae883b19849341b5b1dbe991025a7ee67f03a0a6))
* rename env var ([#19](https://github.com/gnosisguild/zodiac-sdk/issues/19)) ([43afa46](https://github.com/gnosisguild/zodiac-sdk/commit/43afa46b75de2375c3ce4a3a28b411fcc1847318))

## [1.6.0](https://github.com/gnosisguild/zodiac-sdk/compare/v1.5.0...v1.6.0) (2026-04-17)


### Features

* publish codegen consolidation (node_modules/.zodiac-os) ([#15](https://github.com/gnosisguild/zodiac-sdk/issues/15)) ([964f707](https://github.com/gnosisguild/zodiac-sdk/commit/964f707cfd812ebef93f4e031526190a40431e2f))

## [1.5.0](https://github.com/gnosisguild/zodiac-sdk/compare/v1.4.0...v1.5.0) (2026-04-16)


### Features

* type-check contract addresses in defineConfig ([#12](https://github.com/gnosisguild/zodiac-sdk/issues/12)) ([61b9a02](https://github.com/gnosisguild/zodiac-sdk/commit/61b9a02b4225a1b3a20f637bba8fc8418bc90e43))

## [1.4.0](https://github.com/gnosisguild/zodiac-sdk/compare/v1.3.0...v1.4.0) (2026-04-16)


### Features

* roles permissions + checksum addresses ([#10](https://github.com/gnosisguild/zodiac-sdk/issues/10)) ([fa38515](https://github.com/gnosisguild/zodiac-sdk/commit/fa3851507c1dfeb77a105355ffd11823239bb458))

## [1.3.0](https://github.com/gnosisguild/zodiac-sdk/compare/v1.2.0...v1.3.0) (2026-04-16)


### Features

* allow kit, canonical roles, and circular refs ([#8](https://github.com/gnosisguild/zodiac-sdk/issues/8)) ([27cf42e](https://github.com/gnosisguild/zodiac-sdk/commit/27cf42ebc0c272b6b9be920af8554d14cd265a0c))

## [1.2.0](https://github.com/gnosisguild/zodiac-sdk/compare/v1.1.1...v1.2.0) (2026-03-26)


### Features

* add `constellation()` and `apply()` ([#7](https://github.com/gnosisguild/zodiac-sdk/issues/7)) ([d0ee4f6](https://github.com/gnosisguild/zodiac-sdk/commit/d0ee4f63ae0e68d6e67d3a114c1cfadd1d86f5bd))


### Bug Fixes

* point exports at the correct files ([730492f](https://github.com/gnosisguild/zodiac-sdk/commit/730492fa202513fe6e38033193dde8281f2c9829))

## [1.1.1](https://github.com/gnosisguild/zodiac-sdk/compare/v1.1.0...v1.1.1) (2025-11-07)


### Bug Fixes

* add repository url ([7643fa9](https://github.com/gnosisguild/zodiac-sdk/commit/7643fa9dc401c9d127bc96b5f2f082f3791c24b5))

## [1.1.0](https://github.com/gnosisguild/zodiac-sdk/compare/v1.0.0...v1.1.0) (2025-11-07)


### Features

* improve readme ([451c6b5](https://github.com/gnosisguild/zodiac-sdk/commit/451c6b5d560e801eae11036d0c15f05f642d7b10))

## 1.0.0 (2025-11-06)


### Features

* basics for typegen ([#1](https://github.com/gnosisguild/zodiac-sdk/issues/1)) ([4d93735](https://github.com/gnosisguild/zodiac-sdk/commit/4d93735f9a77917e5036f33189712f90e0ac7a37))
* implement initial api client ([ec814f6](https://github.com/gnosisguild/zodiac-sdk/commit/ec814f676eb3cb1929b54a77321347c51060db46))


### Bug Fixes

* add auth header ([90cbbc8](https://github.com/gnosisguild/zodiac-sdk/commit/90cbbc8c5b26ba6c9c47a3a4a6eeb73534d235f9))
* fix error handling ([a9a4cf5](https://github.com/gnosisguild/zodiac-sdk/commit/a9a4cf5f9158e3dd83b1e2ac4fe1cc87e69a837a))
