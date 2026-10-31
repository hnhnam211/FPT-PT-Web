import { useState } from "react";

const ADMIN_PASSWORD = "ftcdanang";

function AdminLogin() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = () => {
    setError("");
    setLoading(true);

    if (password === ADMIN_PASSWORD) {
      window.location.href = "/admin";
      return;
    }

    setError("Mật khẩu không đúng.");
    setLoading(false);
  };

  return (
    <div className="admin-login">

      <div className="admin-login-box">

        <p className="section-label">
          FPT PT ROBOTICS
        </p>

        <h1>
          ADMIN
          <br />
          <span>LOGIN.</span>
        </h1>

        <div className="login-form">

          <label>Password</label>

          <input
            type="password"
            value={password}
            onChange={(e) =>
              setPassword(e.target.value)
            }
            placeholder="ftcdanang"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleLogin();
              }
            }}
          />

          {error && (
            <p className="login-error">
              {error}
            </p>
          )}

          <button
            onClick={handleLogin}
            disabled={loading}
          >
            {loading ? "LOGGING IN..." : "LOGIN →"}
          </button>

        </div>

      </div>

    </div>
  );
}

export default AdminLogin;