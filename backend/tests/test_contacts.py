"""Company / placement-cell contact sharing and privacy.

Contacts (name, designation, email, phone) are visible to: the receiver of a connection
request (the requester's contact), both sides of an accepted connection, and staff on a
shared drive. Never to students. Run: python -m tests.test_contacts (needs the seeded DB).
"""
import json

from fastapi.testclient import TestClient
from pymongo import MongoClient

from app.main import app

H = lambda t: {"Authorization": f"Bearer {t}"}


def check(cond, label):
    assert cond, label
    print(f"  ok  {label}")


def run():
    db = MongoClient()["campus_connect"]
    with TestClient(app) as c:
        login = lambda e, p: c.post("/api/auth/login", json={"email": e, "password": p}).json()["token"]
        rec = login("recruiter@campusconnect.dev", "recruiter123")       # Nimbus, connected to Westbridge
        tpo = login("tpo@campusconnect.dev", "tpo123")                     # Westbridge
        stu = login("student@campusconnect.dev", "student123")
        lumen = login("campus@lumenhealth.dev", "recruiter123")            # has a pending request to Westbridge

        conns = c.get("/api/connections", headers=H(rec)).json()
        wb = next(x for x in conns if x["status"] == "accepted" and x["other"]["short"] == "WIT")
        check(any(p["email"] == "tpo@campusconnect.dev" for p in wb["contacts"]), "company sees TPO contact once connected")

        tconns = c.get("/api/connections", headers=H(tpo)).json()
        incoming = next(x for x in tconns if x["status"] == "pending" and x["incoming"])
        check(incoming["contacts"] and incoming["contacts"][0]["email"] == "campus@lumenhealth.dev",
              "college sees the requester's contact on an incoming request")

        lconns = c.get("/api/connections", headers=H(lumen)).json()
        out = next(x for x in lconns if x["status"] == "pending")
        check(out["contacts"] is None, "requester does not see the college's contact before acceptance")

        drive = next(d for d in c.get("/api/drives", headers=H(rec)).json() if d["status"] == "published")
        dd = c.get(f"/api/drives/{drive['id']}", headers=H(rec)).json()
        check(any(p["email"] == "tpo@campusconnect.dev" for p in dd["contacts"]), "drive page shows placement-cell contact to company")
        dd = c.get(f"/api/drives/{drive['id']}", headers=H(tpo)).json()
        check(any(p["email"] == "recruiter@campusconnect.dev" for p in dd["contacts"]), "drive page shows company contact to college")

        check(c.get("/api/org/profile", headers=H(stu)).status_code == 403, "students can't open org profiles")
        leaked = []
        for path in ["/auth/me", "/drives", f"/drives/{drive['id']}", "/announcements", "/students/me/dashboard",
                     f"/drives/{drive['id']}/history", "/experiences"]:
            body = json.dumps(c.get("/api/" + path.lstrip("/"), headers=H(stu)).json())
            if "tpo@campusconnect.dev" in body or "recruiter@campusconnect.dev" in body or "9820012345" in body:
                leaked.append(path)
        check(not leaked, f"no staff email or phone in any student response {leaked or ''}")

        me = c.get("/api/org/profile", headers=H(rec)).json()
        body = {"person": {"name": me["person"]["name"], "designation": "Campus Hiring Lead", "phone": "not-a-phone"},
                "company": {k: me["org"].get(k) for k in ("website", "industry", "size", "hq_city", "about")}}
        check(c.put("/api/org/profile", json=body, headers=H(rec)).status_code == 422, "invalid phone rejected")
        body["person"]["phone"] = "9820099999"
        r = c.put("/api/org/profile", json=body, headers=H(rec))
        check(r.status_code == 200 and r.json()["person"]["phone"] == "9820099999", "company updates its contact")
        tc = next(x for x in c.get("/api/connections", headers=H(tpo)).json() if x["status"] == "accepted" and x["other"]["name"] == "Nimbus Analytics")
        check(any(p["phone"] == "9820099999" for p in tc["contacts"]), "connected college sees the updated phone")
    # put the demo phone back
    db.users.update_one({"email": "recruiter@campusconnect.dev"}, {"$set": {"phone": "9820030000"}})
    print("all contact checks passed")


if __name__ == "__main__":
    run()
