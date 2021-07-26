"use strict";

const downloads = document.getElementById("downloads");
const time = document.getElementById("time");
const upload = document.getElementById("upload");
const cancel = document.getElementById("cancel");

document.getElementById("settings").addEventListener("click", (event) => {
	// disable button (which triggered this) until process is finished
	event.target.disabled = true;

	browser.runtime.openOptionsPage().finally(() => {
		// re-enable button
		event.target.disabled = false;
	});
});

upload.addEventListener("click", (event) => {
	// disable button (which triggered this) until process is finished
	event.target.disabled = true;
	cancel.disabled = true;

	const response = {
		"type": POPUP,
		"downloads": downloads.value,
		"time": time.value
	};
	// console.log(response);

	browser.runtime.sendMessage(response);

	setTimeout(() => {
		window.close();
	}, 1000);
});

cancel.addEventListener("click", (event) => {
	// disable button (which triggered this) until process is finished
	event.target.disabled = true;
	upload.disabled = true;

	const response = {
		"type": POPUP,
		canceled: true
	};
	// console.log(response);

	browser.runtime.sendMessage(response);

	setTimeout(() => {
		window.close();
	}, 1000);
});

browser.runtime.sendMessage({ "type": POPUP }).then((message) => {
	// console.log(message);
	if (message.type === POPUP) {
		const send = message.send;
		downloads.value = send.downloads;
		time.value = send.time;

		const file = message.file;
		document.getElementById("name").textContent = file.name;
		document.getElementById("size").textContent = `${outputunit(file.size, false)}B${file.size >= 1000 ? ` (${outputunit(file.size, true)}B)` : ""}`;

		upload.disabled = false;
		cancel.disabled = false;
	}
});
