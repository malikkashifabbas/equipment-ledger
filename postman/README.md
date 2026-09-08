# Postman verification

## Import

1. Start and seed the application.
2. In Postman, select **Import**.
3. Import `Equipment-Ledger.postman_collection.json` and `Equipment-Ledger.postman_environment.json`.
4. Select **Equipment Ledger - Local** from the environment selector.
5. Run folder **00 - Setup** first. It fills the asset and worker variables automatically.

## Running

Run folders in numeric order after a fresh `npm run seed`. The collection-level tests check JSON responses and response time; request-level tests check status and domain results. The workflow folders mutate data, so reseed before repeating the entire run.

Concurrent issue cannot be proven by a sequential Collection Runner. Open two copies of **Issue asset**, use the same `assetId`, different workers, and different UUID keys, then send both together. Exactly one must return 201 and the other 409. The automated 20-request race is covered by `npm run test:e2e`.

## Sharing

Export both files as Collection v2.1 and Postman Environment JSON. Keep the collection in the Git repository. Do not include secrets or production credentials. For submission, share the repository link and optionally attach the exported collection; localhost URLs are expected because reviewers run the project locally.
