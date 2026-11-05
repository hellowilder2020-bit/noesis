import subprocess
import sqlite3
import hashlib
from flask import Flask, request

app = Flask(__name__)

# 1. Hardcoded secret
SECRET_KEY = "admin_password_12345"

# 2. SQL Injection vulnerability
@app.route("/user")
def get_user():
    username = request.args.get("username")

    conn = sqlite3.connect("users.db")
    cursor = conn.cursor()

    query = "SELECT * FROM users WHERE username = '" + username + "'"
    cursor.execute(query)

    return str(cursor.fetchall())


# 3. Command Injection vulnerability
@app.route("/ping")
def ping():
    ip = request.args.get("ip")

    result = subprocess.check_output(
        "ping -c 1 " + ip,
        shell=True
    )

    return result.decode()


# 4. Weak hashing algorithm
def hash_password(password):
    return hashlib.md5(password.encode()).hexdigest()


# 5. Debug mode enabled
if __name__ == "__main__":
    app.run(debug=True)