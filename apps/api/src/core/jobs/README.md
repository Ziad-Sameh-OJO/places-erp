# jobs
Producers only: the API puts jobs on BullMQ queues (Redis); `apps/worker` runs them. Queue names and payload
types live here so both sides share them.
