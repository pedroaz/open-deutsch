const chooseButton = document.querySelector("#choose-folder");
const status = document.querySelector("#status");
const routeStatus = document.querySelector("#route-status");

window.openDeutschSpike.onActivityRoute((activityId) => {
  routeStatus.textContent = `Opened activity ${activityId}.`;
});

chooseButton.addEventListener("click", async () => {
  chooseButton.disabled = true;
  status.textContent = "Opening folder chooser…";
  try {
    const result = await window.openDeutschSpike.chooseDirectory();
    status.textContent =
      result.selected && result.count === 1
        ? "Folder selection stub completed."
        : "Folder selection was canceled.";
  } catch {
    status.textContent = "Folder selection failed.";
  } finally {
    chooseButton.disabled = false;
  }
});
