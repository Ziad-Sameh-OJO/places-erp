# fingerprint-agent

A small program that runs on one computer inside the office, next to the ZKTeco fingerprint device.
Every few minutes it pulls new punches from the device on the local network and posts them to
`POST /api/v1/hr/attendance/punches` with a device token. The API maps device user IDs to employees and applies
`attendanceDay()` from `@places/domain`. If the device or the agent is down, HR uploads the device's Excel sheet
instead — the same import path, and the database's unique (employee, day) key prevents duplicates.

To decide with the client: device brand / model (M-05 open question). Node + `node-zklib`, or Python + `pyzk`.
