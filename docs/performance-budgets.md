# Performance budgets

Open Deutsch measures local performance with `make performance`. The benchmark creates synthetic data in a disposable temporary directory, never opens the learner's configured data root, and prints aggregate timings without learner text or paths.

The current budgets are intentionally operational rather than product claims:

| Workload | p95 budget | Evidence boundary |
| --- | ---: | --- |
| desktop runtime cold import | 1,500 ms | fresh Node child importing the built desktop backend |
| dashboard projection query | 200 ms | 100 prepared activities, bounded to 20 rows |
| correction streaming first event | 50 ms | event-loop handoff responsiveness; model latency is excluded |
| large History query | 500 ms | 10,000 synthetic entries, indexed activity filter, bounded to 100 rows |
| SRS session creation query | 150 ms | 100 due vocabulary records, bounded to 20 cards |
| MCP startup import | 1,500 ms | fresh Node child importing the built MCP server |
| process memory | 512 MiB | benchmark process RSS after synthetic workload setup |

The History and SRS paths use explicit indexes and limits. A future regression should first inspect the JSON evidence and query plan, then add or adjust indexes/pagination based on that evidence. Model, network, Voice, and account-consuming behavior is not part of this local gate.
