# Verification cases

| Case | Expected evidence |
| --- | --- |
| FILES-REFRESH-01 | A held request shows the shared translucent overlay, preserves row geometry and leaves search enabled. |
| FILES-REFRESH-02 | The spinner is centered on the visible results before and after scrolling a tall list. |
| FILES-REFRESH-03 | Failure clears the overlay, preserves rows and a retry succeeds. |
| FILES-REFRESH-04 | Desktop uses compact controls. A narrow layout wraps without horizontal overflow. |

Use the existing Files Chrome scenarios and a deterministic caught refresh
request. Backend contracts are outside the changed boundary.
