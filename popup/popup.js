"use strict";

const downloads = document.getElementById("downloads");
const days = document.getElementById("days");
const hours = document.getElementById("hours");
const minutes = document.getElementById("minutes");
const upload = document.getElementById("upload");
const cancel = document.getElementById("cancel");

// Only send one event, no matter what happens here.
let eventHasBeenSend = false;

document.getElementById("settings").addEventListener("click", (event) => {
	// disable button (which triggered this) until process is finished
	event.target.disabled = true;

	browser.runtime.openOptionsPage().finally(() => {
		// re-enable button
		event.target.disabled = false;
	});
});

window.addEventListener("unload", (event) => {
	if (!eventHasBeenSend) {
		const response = {
			type: POPUP,
			canceled: true
		};
		// console.log(response);

		// Does not work: https://bugzilla.mozilla.org/show_bug.cgi?id=1534041
		browser.runtime.sendMessage(response);
	}

	eventHasBeenSend = true;
});

document.getElementById("form").addEventListener("submit", (event) => {
	event.preventDefault();

	if (!event.target.checkValidity()) {
		// event.target.reportValidity();
		return;
	}

	// disable button (which triggered this) until process is finished
	event.submitter.disabled = true;
	cancel.disabled = true;

	const response = {
		type: POPUP,
		downloads: downloads.valueAsNumber,
		time: days.valueAsNumber * 1440 + hours.valueAsNumber * 60 + minutes.valueAsNumber
	};
	// console.log(response);

	browser.runtime.sendMessage(response);

	eventHasBeenSend = true;

	setTimeout(() => {
		window.close();
	}, 1000);
});

cancel.addEventListener("click", (event) => {
	// disable button (which triggered this) until process is finished
	event.target.disabled = true;
	upload.disabled = true;

	const response = {
		type: POPUP,
		canceled: true
	};
	// console.log(response);

	browser.runtime.sendMessage(response);

	eventHasBeenSend = true;

	setTimeout(() => {
		window.close();
	}, 1000);
});

browser.runtime.sendMessage({ type: POPUP }).then((message) => {
	// console.log(message);
	if (message.type === POPUP) {
		const send = message.send;
		downloads.value = send.downloads;
		days.value = Math.floor(send.time / 1440);
		hours.value = Math.floor(send.time % 1440 / 60);
		minutes.value = send.time % 1440 % 60;

		const file = message.file;
		document.getElementById("name").textContent = file.name;
		document.getElementById("size").textContent = `${outputunit(file.size, false)}B${file.size >= 1000 ? ` (${outputunit(file.size, true)}B)` : ""}`;

		upload.disabled = false;
		cancel.disabled = false;
	}
});
