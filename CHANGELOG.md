# Changelog

All notable changes to the CTG.EXCHANGE TypeScript SDK are documented here.
This project follows [Semantic Versioning](https://semver.org/).

## [0.1.2] - 2026-06-01

### Documentation

- README: added a private `UserStream` code snippet alongside the
  existing public `MarketDataStream` one. No code changes.

## [0.1.1] - 2026-06-01

### Added

- `Client.getOpenOrders()` — wraps `GET /api/v1/me/orders/open`, the
  cross-symbol open-orders endpoint.

## [0.1.0] - 2026-05-22

### Added

- Initial release: `Client` covering the full `/api/v1` REST surface —
  public market data and private account, order and trade endpoints.
- HMAC request signing for REST and the in-band WebSocket auth.
- `MarketDataStream` and `UserStream` WebSocket clients with
  auto-reconnect and subscription replay, exposed as async iterables.
- Typed payload interfaces following the API's decimal-string contract.
- Typed error hierarchy (`ApiError` and subclasses) with `requestId`
  and `Retry-After` surfaced.
- ESM + CommonJS builds with bundled type declarations.
