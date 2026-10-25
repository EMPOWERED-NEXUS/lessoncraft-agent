const slot = document.getElementById("account-slot");
if (slot) {
  fetch("/api/auth/session")
    .then((response) => response.json())
    .then((session) => {
      if (!session?.authenticated) return;
      slot.replaceChildren();
      const name = document.createElement("span");
      name.className = "account-name";
      name.textContent = session.email || "Signed in";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "nav-button";
      button.id = "sign-out";
      button.textContent = "Sign out";
      button.addEventListener("click", async () => {
        button.disabled = true;
        await fetch("/api/auth/logout", { method: "POST" });
        window.location.href = "/login";
      });
      slot.append(name, button);
    })
    .catch(() => {});
}
