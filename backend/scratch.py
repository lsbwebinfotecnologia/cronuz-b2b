from datetime import datetime, timezone, timedelta
def get_current_br_time():
    tz = timezone(timedelta(hours=-3))
    return datetime.now(tz)
