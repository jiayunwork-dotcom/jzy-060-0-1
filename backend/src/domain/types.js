/**
 * Domain type contracts. The backend is plain JavaScript; these JSDoc typedefs
 * are the single source of truth shared by every module below.
 *
 * @typedef {'system' | 'business'} SourceKind
 * @typedef {'percent' | 'number'} SourceUnit
 * @typedef {'ok' | 'error'} SourceState
 *
 * @typedef {Object} SourceDef
 * @property {string} id            Stable identifier, e.g. "cpu"
 * @property {string} name          Human readable label, e.g. "CPU 使用率"
 * @property {SourceKind} kind      System metric or business metric
 * @property {SourceUnit} unit      "percent" drives 0..100 gauges, "number" plain values
 * @property {number} [min]         Expected lower bound (for bar/gauge rendering)
 * @property {number} [max]         Expected upper bound
 *
 * @typedef {Object} SourceItem Runtime state of a managed data source
 * @property {string} id
 * @property {string} name
 * @property {SourceKind} kind
 * @property {SourceUnit} unit
 * @property {number} [min]
 * @property {number} [max]
 * @property {boolean} enabled      Collection switch. Off -> no new points.
 * @property {SourceState} status   Probe state, independent of the switch.
 * @property {number} lastValue
 * @property {number|null} lastAt
 * @property {string|null} error
 *
 * @typedef {Object} MetricPoint
 * @property {string} source
 * @property {number} ts     Epoch milliseconds
 * @property {number} value
 *
 * @typedef {'warning' | 'critical'} AlertLevel
 * @typedef {'>' | '<'} AlertOperator
 *
 * @typedef {Object} AlertRule
 * @property {string} id
 * @property {string} source
 * @property {string} name
 * @property {AlertOperator} operator
 * @property {number} threshold
 * @property {AlertLevel} level
 * @property {boolean} enabled
 *
 * @typedef {Object} ActiveAlert
 * @property {string} ruleId
 * @property {string} source
 * @property {string} ruleName
 * @property {AlertLevel} level
 * @property {number} threshold
 * @property {AlertOperator} operator
 * @property {number} value
 * @property {number} startedAt
 *
 * @typedef {Object} AlertEvent
 * @property {string} id
 * @property {'fired' | 'resolved'} type
 * @property {string} ruleId
 * @property {string} source
 * @property {string} ruleName
 * @property {AlertLevel} level
 * @property {number} threshold
 * @property {AlertOperator} operator
 * @property {number} value
 * @property {number} at
 *
 * @typedef {import('ws').RawData} RawData
 */
export {};
