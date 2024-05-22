"use strict";

import { POPUP, outputunit } from "/common.js";

import * as characters from "/common/modules/data/Characters.js";
import * as words from "/common/modules/data/Words.js";
import * as emojis from "/common/modules/data/Emojis.js";

const MAX_UINT8 = (1 << 8) - 1;
const MAX_UINT16 = (1 << 16) - 1;
const MAX_UINT32 = ~0 >>> 0;

// Some characters are removed due to visual similarity:
const LOWERCASE_ALPHA = Array.from("abcdefghijkmnpqrstuvwxyz"); // no 'l' or 'o'
const UPPERCASE_ALPHA = Array.from("ABCDEFGHJKLMNPQRSTUVWXYZ"); // no 'I' or 'O'
const DIGITS = Array.from("23456789"); // no '1' or '0'
const SPECIAL_CHARACTERS = Array.from("-~!@#$%^&*_+=)}:;\"'>,.?]");
// const SPECIAL_CHARACTERS = Array.from(" -~!@#$%^&*_+=`|(){}[:;\"'<>,.?]");

const downloads = document.getElementById("downloads");
const days = document.getElementById("days");
const hours = document.getElementById("hours");
const minutes = document.getElementById("minutes");
const upload = document.getElementById("upload");
const cancel = document.getElementById("cancel");
const password = document.getElementById("password");
const pronunciation = document.getElementById("pronunciation");
const text = document.getElementById("text");
const random = document.getElementById("random");

// Only send one event, no matter what happens here.
let eventHasBeenSend = false;

let total = 0;

/**
* Random UInt8 number in range [0, range).
*
* @param {number} range
* @returns {number}
*/
function randomUInt8(range) {
	if (range > MAX_UINT8) {
		throw new Error("`range` cannot fit into uint8");
	}
	const MAX_ACCEPTABLE_VALUE = Math.floor(MAX_UINT8 / range) * range - 1;

	const randomValueArr = new Uint8Array(1);
	do {
		crypto.getRandomValues(randomValueArr);
	} while (randomValueArr[0] > MAX_ACCEPTABLE_VALUE);

	return randomValueArr[0] % range;
}

/**
* Random Uint16 number in range [0, range).
*
* @param {number} range
* @returns {number}
*/
function randomUint16(range) {
	if (range > MAX_UINT16) {
		throw new Error("`range` cannot fit into uint16");
	}
	const MAX_ACCEPTABLE_VALUE = Math.floor(MAX_UINT16 / range) * range - 1;

	const randomValueArr = new Uint16Array(1);
	do {
		crypto.getRandomValues(randomValueArr);
	} while (randomValueArr[0] > MAX_ACCEPTABLE_VALUE);

	return randomValueArr[0] % range;
}

/**
* Shuffle the order of characters in a string.
*
* @param {string[]} arr
* @returns {void}
*/
function shuffle(arr) {
	const randomValues = new Uint32Array(arr.length - 1);
	crypto.getRandomValues(randomValues);

	// Fisher-Yates Shuffle
	// https://en.wikipedia.org/wiki/Fisher%E2%80%93Yates_shuffle
	for (let i = arr.length - 1; i > 0; --i) {
		const j = Math.floor(randomValues[i - 1] / MAX_UINT32 * (i + 1));
		[arr[i], arr[j]] = [arr[j], arr[i]];
	}
}

/**
* Generate random password.
*
* @param {number} length
* @param {Array.<string[]>} length
* @returns {[string, string]}
*/
function generatePassword(length, requiredClasses) {
	const password = [];
	const allRequiredCharacters = requiredClasses.flat();

	for (const charClassString of requiredClasses) {
		password.push(charClassString[randomUInt8(charClassString.length)]);
	}

	while (password.length < length) {
		password.push(allRequiredCharacters[randomUInt8(allRequiredCharacters.length)]);
	}

	shuffle(password);

	return [password.join(""), password.map((x) => `<${characters.characters[x]}>`).join("")];
}

/**
* Generate random passphrase.
*
* @param {number} length
* @param {readonly string[]} awords
* @returns {string}
*/
function generatePassphrase(length, awords) {
	const passphrase = [];

	while (passphrase.length < length) {
		passphrase.push(awords[randomUint16(awords.length)]);
	}

	return passphrase.join(" ");
}

/**
* Generate random emoji password.
*
* @param {number} length
* @param {readonly string[]} aemojis
* @returns {[string, string]}
*/
function generateEmojis(length, aemojis) {
	const password = [];

	while (password.length < length) {
		password.push(aemojis[randomUint16(aemojis.length)]);
	}

	return [password.join(""), password.map((x) => `<${emojis.aemojis[x]}>`).join("")];
}

document.getElementById("toggle").addEventListener("change", (event) => {
	password.type = event.target.checked ? "text" : "password";

	password.focus();
});

document.getElementById("generate").addEventListener("click", (/* event */) => {
	let apassword = "";
	let atext = "";

	pronunciation.classList.add("hidden");

	switch (Number.parseInt(random.value, 10)) {
		case 1:
			[apassword, atext] = generatePassword(15, [LOWERCASE_ALPHA, UPPERCASE_ALPHA, DIGITS, SPECIAL_CHARACTERS]);
			break;
		case 2:
			[apassword, atext] = generatePassword(15, [LOWERCASE_ALPHA, UPPERCASE_ALPHA, DIGITS]);
			break;
		case 3:
			apassword = generatePassphrase(6, words.large);
			break;
		case 4:
			apassword = generatePassphrase(8, words.short);
			break;
		case 5:
			[apassword, atext] = generateEmojis(7, emojis.emojis);
			break;
		case 6:
			[apassword, atext] = generateEmojis(8, emojis.basic);
			break;
	}

	password.value = apassword;
	if (atext) {
		text.value = atext;
		pronunciation.classList.remove("hidden");
	}

	password.focus();
});

document.getElementById("settings").addEventListener("click", (event) => {
	// disable button (which triggered this) until process is finished
	event.target.disabled = true;

	browser.runtime.openOptionsPage().finally(() => {
		// re-enable button
		event.target.disabled = false;
	});
});

addEventListener("beforeunload", (/* event */) => {
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
		time: days.valueAsNumber * 1440 + hours.valueAsNumber * 60 + minutes.valueAsNumber,
		password: password.value
	};
	// console.log(response);

	browser.runtime.sendMessage(response);

	eventHasBeenSend = true;

	setTimeout(() => {
		close();
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
		close();
	}, 1000);
});

/**
* Update files.
*
* @param {{name: string, size: number}[]} files
* @returns {void}
*/
function updatefiles(files) {
	const table = document.createElement("table");

	for (const file of files) {
		const row = table.insertRow(0);
		const template = document.getElementById("send-file");
		const clone = template.content.cloneNode(true);

		clone.getElementById("name").textContent = file.name;
		clone.getElementById("size").textContent = `${browser.i18n.getMessage("popupSize")} ${outputunit(file.size, false)}${browser.i18n.getMessage("popupB")}${file.size >= 1000 ? ` (${outputunit(file.size, true)}${browser.i18n.getMessage("popupB")})` : ""}`;

		row.append(clone);

		total += file.size;
	}

	document.getElementById("table").replaceChildren(table);

	document.getElementById("total").textContent = `${outputunit(total, false)}${browser.i18n.getMessage("popupB")}${total >= 1000 ? ` (${outputunit(total, true)}${browser.i18n.getMessage("popupB")})` : ""}`;
}

browser.runtime.sendMessage({ type: POPUP }).then((message) => {
	// console.log(message);
	if (message.type === POPUP) {
		const { send } = message;
		downloads.value = send.downloads;
		days.value = Math.floor(send.time / 1440);
		hours.value = Math.floor(send.time % 1440 / 60);
		minutes.value = send.time % 60;

		updatefiles(message.files);

		upload.disabled = false;
		cancel.disabled = false;
	}
});

browser.runtime.onMessage.addListener((message, _sender) => {
	if (message.type === POPUP) {
		updatefiles(message.files);
	}
});
