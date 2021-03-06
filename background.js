"use strict";

import * as AddonSettings from "/common/modules/AddonSettings/AddonSettings.js";

const NONCE_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_LENGTH = 16;
const MODE_ENCRYPT = "encrypt";
const MODE_DECRYPT = "decrypt";
const ECE_RECORD_SIZE = 1024 * 64;

const uploads = new Map();

const encoder = new TextEncoder();

const numberFormat = new Intl.NumberFormat();
const numberFormat1 = new Intl.NumberFormat([], { style: "unit", unit: "day", unitDisplay: "long" });
const numberFormat2 = new Intl.NumberFormat([], { style: "unit", unit: "hour", unitDisplay: "long" });
const numberFormat3 = new Intl.NumberFormat([], { style: "unit", unit: "minute", unitDisplay: "long" });
const numberFormat4 = new Intl.NumberFormat([], { style: "unit", unit: "second", unitDisplay: "long" });

const formatter = new Intl.ListFormat();

const promiseMap = new Map();

// Display notifications
let SEND = true;
// Display link to Send service
let LINK = false;

/**
 * Create notification.
 *
 * @param {string} title
 * @param {string} message
 * @param {number} [date]
 * @returns {void}
 */
function notification(title, message, date) {
	console.log(title, message, date && new Date(date));
	if (SEND) {
		browser.notifications.create({
			"type": "basic",
			"iconUrl": browser.runtime.getURL("icons/icon.svg"),
			"title": title,
			"message": message,
			"eventTime": date
		});
	}
}

/**
 * Get seconds as digital clock.
 *
 * @param {number} sec_num
 * @returns {string}
 */
function getSecondsAsDigitalClock(sec_num) {
	// console.log(sec_num);
	const d = Math.floor(sec_num / 86400);
	const h = Math.floor((sec_num % 86400) / 3600);
	const m = Math.floor((sec_num % 86400 % 3600) / 60);
	const s = sec_num % 86400 % 3600 % 60;
	const text = [];
	if (d > 0) {
		text.push(numberFormat1.format(d));
	}
	if (h > 0) {
		text.push(numberFormat2.format(h));
	}
	if (m > 0) {
		text.push(numberFormat3.format(m));
	}
	if (s > 0) {
		text.push(numberFormat4.format(s));
	}
	return formatter.format(text);
}

/**
 * Array to Base64.
 * Adapted from: https://github.com/mozilla/send/blob/master/app/utils.js
 *
 * @param {Object[]} array
 * @returns {void}
 */
function arrayToB64(array) {
	return btoa(String.fromCharCode(...array))
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=/g, "");
}

/**
 * Delay.
 * Adapted from: https://github.com/mozilla/send/blob/master/app/utils.js
 *
 * @param {number} [delay]
 * @returns {Promise}
 */
function delay(delay = 100) {
	return new Promise((resolve) => setTimeout(resolve, delay));
}

/**
 * Concatenate arrays.
 * Adapted from: https://github.com/mozilla/send/blob/master/app/utils.js
 *
 * @param {Object[]} b1
 * @param {Object[]} b2
 * @returns {Object[]}
 */
function concat(b1, b2) {
	const result = new Uint8Array(b1.length + b2.length);
	result.set(b1, 0);
	result.set(b2, b1.length);
	return result;
}

/**
 * Generate salt.
 * Adapted from: https://github.com/mozilla/send/blob/master/app/ece.js
 *
 * @param {number} len
 * @returns {Object[]}
 */
function generateSalt(len) {
	const randSalt = new Uint8Array(len);
	crypto.getRandomValues(randSalt);
	return randSalt.buffer;
}

// Adapted from: https://github.com/mozilla/send/blob/master/app/ece.js
class ECETransformer {
	constructor(mode, ikm, rs, salt) {
		this.mode = mode;
		this.prevChunk = null;
		this.seq = 0;
		this.firstchunk = true;
		this.rs = rs;
		this.ikm = ikm.buffer;
		this.salt = salt;
	}

	async generateKey() {
		const inputKey = await crypto.subtle.importKey(
			"raw",
			this.ikm,
			"HKDF",
			false,
			["deriveKey"]
		);

		return crypto.subtle.deriveKey(
			{
				name: "HKDF",
				salt: this.salt,
				info: encoder.encode("Content-Encoding: aes128gcm\0"),
				hash: "SHA-256"
			},
			inputKey,
			{
				name: "AES-GCM",
				length: 128
			},
			true, // Edge polyfill requires key to be extractable to encrypt :/
			["encrypt", "decrypt"]
		);
	}

	async generateNonceBase() {
		const inputKey = await crypto.subtle.importKey(
			"raw",
			this.ikm,
			"HKDF",
			false,
			["deriveKey"]
		);

		const base = await crypto.subtle.exportKey(
			"raw",
			await crypto.subtle.deriveKey(
				{
					name: "HKDF",
					salt: this.salt,
					info: encoder.encode("Content-Encoding: nonce\0"),
					hash: "SHA-256"
				},
				inputKey,
				{
					name: "AES-GCM",
					length: 128
				},
				true,
				["encrypt", "decrypt"]
			)
		);

		return base.slice(0, NONCE_LENGTH);
	}

	generateNonce(seq) {
		if (seq > 0xffffffff) {
			throw new Error("record sequence number exceeds limit");
		}
		const nonce = new DataView(this.nonceBase.slice());
		const m = nonce.getUint32(nonce.byteLength - 4);
		const xor = (m ^ seq) >>> 0; // forces unsigned int xor
		nonce.setUint32(nonce.byteLength - 4, xor);
		return new Uint8Array(nonce.buffer);
	}

	pad(data, isLast) {
		const len = data.length;
		if (len + TAG_LENGTH >= this.rs) {
			throw new Error("data too large for record size");
		}

		if (isLast) {
			return concat(data, Uint8Array.of(2));
		} else {
			const padding = new Uint8Array(this.rs - len - TAG_LENGTH);
			padding[0] = 1;
			return concat(data, padding);
		}
	}

	unpad(data, isLast) {
		for (let i = data.length - 1; i >= 0; --i) {
			if (data[i]) {
				if (isLast) {
					if (data[i] !== 2) {
						throw new Error("delimiter of final record is not 2");
					}
				} else {
					if (data[i] !== 1) {
						throw new Error("delimiter of not final record is not 1");
					}
				}
				return data.slice(0, i);
			}
		}
		throw new Error("no delimiter found");
	}

	createHeader() {
		const nums = new DataView(new ArrayBuffer(5));
		nums.setUint32(0, this.rs);
		return concat(new Uint8Array(this.salt), new Uint8Array(nums.buffer));
	}

	readHeader(buffer) {
		if (buffer.length < 21) {
			throw new Error("chunk too small for reading header");
		}
		const header = {};
		const dv = new DataView(buffer.buffer);
		header.salt = buffer.slice(0, KEY_LENGTH);
		header.rs = dv.getUint32(KEY_LENGTH);
		const idlen = dv.getUint8(KEY_LENGTH + 4);
		header.length = idlen + KEY_LENGTH + 5;
		return header;
	}

	async encryptRecord(buffer, seq, isLast) {
		const nonce = this.generateNonce(seq);
		const encrypted = await crypto.subtle.encrypt(
			{ name: "AES-GCM", iv: nonce },
			this.key,
			this.pad(buffer, isLast)
		);
		return new Uint8Array(encrypted);
	}

	async decryptRecord(buffer, seq, isLast) {
		const nonce = this.generateNonce(seq);
		const data = await crypto.subtle.decrypt(
			{
				name: "AES-GCM",
				iv: nonce,
				tagLength: 128
			},
			this.key,
			buffer
		);

		return this.unpad(new Uint8Array(data), isLast);
	}

	async start(controller) {
		if (this.mode === MODE_ENCRYPT) {
			this.key = await this.generateKey();
			this.nonceBase = await this.generateNonceBase();
			controller.enqueue(this.createHeader());
		} else if (this.mode !== MODE_DECRYPT) {
			throw new Error("mode must be either encrypt or decrypt");
		}
	}

	async transformPrevChunk(isLast, controller) {
		if (this.mode === MODE_ENCRYPT) {
			controller.enqueue(
				await this.encryptRecord(this.prevChunk, this.seq, isLast)
			);
			++this.seq;
		} else {
			if (this.seq === 0) {
				// the first chunk during decryption contains only the header
				const header = this.readHeader(this.prevChunk);
				this.salt = header.salt;
				this.rs = header.rs;
				this.key = await this.generateKey();
				this.nonceBase = await this.generateNonceBase();
			} else {
				controller.enqueue(
					await this.decryptRecord(this.prevChunk, this.seq - 1, isLast)
				);
			}
			++this.seq;
		}
	}

	async transform(chunk, controller) {
		if (!this.firstchunk) {
			await this.transformPrevChunk(false, controller);
		}
		this.firstchunk = false;
		this.prevChunk = new Uint8Array(chunk.buffer);
	}

	async flush(controller) {
		// console.log('ece stream ends')
		if (this.prevChunk) {
			await this.transformPrevChunk(true, controller);
		}
	}
}

// Adapted from: https://github.com/mozilla/send/blob/master/app/ece.js
class StreamSlicer {
	constructor(rs, mode) {
		this.mode = mode;
		this.rs = rs;
		this.chunkSize = mode === MODE_ENCRYPT ? rs - 17 : 21;
		this.partialChunk = new Uint8Array(this.chunkSize); // where partial chunks are saved
		this.offset = 0;
	}

	send(buf, controller) {
		controller.enqueue(buf);
		if (this.chunkSize === 21 && this.mode === MODE_DECRYPT) {
			this.chunkSize = this.rs;
		}
		this.partialChunk = new Uint8Array(this.chunkSize);
		this.offset = 0;
	}

	// reslice input into record sized chunks
	transform(chunk, controller) {
		// console.log('Received chunk with %d bytes.', chunk.byteLength)
		let i = 0;

		if (this.offset > 0) {
			const len = Math.min(chunk.byteLength, this.chunkSize - this.offset);
			this.partialChunk.set(chunk.slice(0, len), this.offset);
			this.offset += len;
			i += len;

			if (this.offset === this.chunkSize) {
				this.send(this.partialChunk, controller);
			}
		}

		while (i < chunk.byteLength) {
			const remainingBytes = chunk.byteLength - i;
			if (remainingBytes >= this.chunkSize) {
				const record = chunk.slice(i, i + this.chunkSize);
				i += this.chunkSize;
				this.send(record, controller);
			} else {
				const end = chunk.slice(i, i + remainingBytes);
				i += end.byteLength;
				this.partialChunk.set(end);
				this.offset = end.byteLength;
			}
		}
	}

	flush(controller) {
		if (this.offset > 0) {
			controller.enqueue(this.partialChunk.slice(0, this.offset));
		}
	}
}

/**
 * TransformStream wrapper.
 * pipeThrough: https://bugzilla.mozilla.org/show_bug.cgi?id=1734243 and TransformStream: https://bugzilla.mozilla.org/show_bug.cgi?id=1730586 require Firefox/Thunderbird 102
 * Adapted from: Adapted from: https://github.com/mozilla/send/blob/master/app/streams.js
 *
 * @param {Object} readable
 * @param {Object} transformer
 * @returns {Object}
 */
function transformStream(readable, transformer) {
	return readable.pipeThrough(new TransformStream(transformer));
}

/**
 * Check Send server version.
 *
 * @param {string} service
 * @returns {boolean}
 */
async function checkServerVersion(service) {
	const url = `https://${new URL(service).host}/__version__`;
	const fetchInfo = {
		// mode: "cors",
		method: "GET"
	};
	const response = await fetch(url, fetchInfo);
	// console.log(response);

	if (response.ok) {
		const json = await response.json();
		console.log(json);

		const version = json.version;
		if (version && version.startsWith("v") && parseInt(version.substring(1).split(".")[0], 10) >= 3) {
			return true;
		} else {
			notification("??? Unsupported Send server version", `Error: The ???${service}??? Send service instance has an unsupported server version: ${version}. This extension requires at least version 3.`);
			return false;
		}
	} else {
		const text = await response.text();
		console.error(text);
		notification("??? Unable to determine Send server version", `Error: Unable to determine the ???${service}??? Send service instance server version. Please check your internet connection and settings.`);
		return false;
	}
}

/**
 * Upload file.
 *
 * @param {Object} account
 * @param {Object} fileInfo
 * @param {Object} tab
 * @param {Object} relatedFileInfo
 * @returns {Object}
 */
async function uploaded(account, { id, name, data }, tab, relatedFileInfo) {
	console.log(account, id, name, data);
	console.time(id);

	// clear cache by reloading all options
	await AddonSettings.loadOptions();
	let send = await AddonSettings.get("account");
	console.log(send);
	send = send[account.id] || send;
	if (relatedFileInfo?.id) {
		const upload = uploads.get(relatedFileInfo.id);
		if (upload) {
			send.time = upload.time || send.time;
			send.downloads = upload.downloads || send.downloads;
		}
	}

	const upload = { canceled: false };
	const file = {
		"name": name || data.name,
		size: data.size,
		type: data.type || "application/octet-stream",
	};
	upload.file = file;
	uploads.set(id, upload);

	const window = await browser.windows.create({
		url: browser.runtime.getURL("popup/popup.html"),
		type: "popup",
		// Should not be needed: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/windows/create#parameters
		allowScriptsToClose: true
	});
	console.log(window);

	const message = await new Promise((resolve) => {
		promiseMap.set(window.id, { resolve, send, file });
	});

	if (message.canceled) {
		upload.canceled = message.canceled;
	} else {
		upload.time = message.time;
		upload.downloads = message.downloads;
	}
	// console.log(message);

	if (upload.canceled) {
		return { aborted: true };
	}

	notification("???? Encrypting and uploading attachment", `????: ${file.name}\n??????: ${outputunit(file.size, false)}B${file.size >= 1000 ? ` (${outputunit(file.size, true)}B)` : ""}`);

	if (!await checkServerVersion(send.service)) {
		return { aborted: true };
	}

	if (upload.canceled) {
		notification("??? Upload of attachment aborted", `Upload of the ???${file.name}??? file was aborted.`);
		return { aborted: true };
	}

	const rawSecret = crypto.getRandomValues(new Uint8Array(16));

	const mode = "encrypt";
	const encStream = transformStream(transformStream(data.stream(), new StreamSlicer(ECE_RECORD_SIZE, mode)), new ECETransformer(mode, rawSecret, ECE_RECORD_SIZE, generateSalt(KEY_LENGTH)));
	const secretKeyPromise = crypto.subtle.importKey(
		"raw",
		rawSecret,
		"HKDF",
		false,
		["deriveKey"]
	);
	const metaKey = await secretKeyPromise.then((secretKey) => {
		return crypto.subtle.deriveKey(
			{
				"name": "HKDF",
				salt: new Uint8Array(),
				info: encoder.encode("metadata"),
				hash: "SHA-256"
			},
			secretKey,
			{
				"name": "AES-GCM",
				length: 128
			},
			false,
			["encrypt", "decrypt"]
		);
	});
	const metadata = await crypto.subtle.encrypt(
		{
			"name": "AES-GCM",
			iv: new Uint8Array(12),
			tagLength: 128
		},
		metaKey,
		encoder.encode(
			JSON.stringify({
				...file,
				manifest: { files: [file] }
			})
		)
	);
	const authKey = await secretKeyPromise.then((secretKey) => {
		return crypto.subtle.deriveKey(
			{
				"name": "HKDF",
				salt: new Uint8Array(),
				info: encoder.encode("authentication"),
				hash: "SHA-256"
			},
			secretKey,
			{
				"name": "HMAC",
				hash: { "name": "SHA-256" }
			},
			true,
			["sign"]
		);
	});
	const rawAuth = await crypto.subtle.exportKey("raw", authKey);

	const url = new URL(send.service).host;
	const ws = await new Promise((resolve) => {
		const ws = new WebSocket(`wss://${url}/api/ws`);
		ws.addEventListener("open", () => resolve(ws), { once: true });
	});

	const fileMeta = {
		fileMetadata: arrayToB64(new Uint8Array(metadata)),
		authorization: `send-v1 ${arrayToB64(new Uint8Array(rawAuth))}`,
		// bearer: bearerToken,
		timeLimit: upload.time * 60,
		dlimit: upload.downloads
	};
	const uploadInfoResponse = new Promise((resolve) => {
		ws.addEventListener("message", (msg) => {
			// console.log(msg);
			const response = JSON.parse(msg.data);
			console.log(response);
			resolve(response);
		}, { once: true });
	});
	ws.send(JSON.stringify(fileMeta));
	const uploadInfo = await uploadInfoResponse;
	if (uploadInfo.error) {
		notification("??? Unable upload attachment", `Error: Unable to upload the ???${file.name}??? file: ${uploadInfo.error}. The download or time limit is likely above the maximum supported by this Send service instance.`);
		return { error: true };
		// throw new Error(uploadInfo.error);
	}
	console.timeLog(id);

	const completedResponse = new Promise((resolve) => {
		ws.addEventListener("message", (msg) => {
			// console.log(msg);
			const response = JSON.parse(msg.data);
			console.log(response);
			if (response.error) {
				throw new Error(response.error);
			} else {
				resolve(response);
			}
		}, { once: true });
	});

	const reader = encStream.getReader();
	let state = await reader.read();
	while (!state.done) {
		if (upload.canceled) {
			ws.close();
		}
		if (ws.readyState !== WebSocket.OPEN) {
			break;
		}
		const buf = state.value;
		ws.send(buf);
		state = await reader.read();
		while (ws.bufferedAmount > ECE_RECORD_SIZE * 2 && ws.readyState === WebSocket.OPEN && !upload.canceled) {
			await delay();
		}
	}
	if (ws.readyState === WebSocket.OPEN) {
		ws.send(new Uint8Array([0])); // EOF
	}

	if (upload.canceled) {
		console.timeEnd(id);
		notification("??? Upload of attachment aborted", `Upload of the ???${file.name}??? file was aborted.`);
		return { aborted: true };
	}

	const json = await completedResponse;
	upload.id = uploadInfo.id;
	upload.owner_token = uploadInfo.ownerToken;

	if (![WebSocket.CLOSED, WebSocket.CLOSING].includes(ws.readyState)) {
		ws.close();
	}

	console.timeEnd(id);

	const expiresAt = new Date();
	expiresAt.setMinutes(expiresAt.getMinutes() + upload.time);

	const aurl = `${uploadInfo.url}#${arrayToB64(rawSecret)}`;
	// console.info(aurl);
	if (json.ok) {
		notification("???? Attachment encrypted and upload", `The ???${file.name}??? file was successfully encrypted and upload! Expires after:\n??????: ${numberFormat.format(upload.downloads)}\n??????: ${getSecondsAsDigitalClock(upload.time * 60)}\n\n${aurl}`);
	} else {
		notification("??? Unable upload attachment", `Error: Unable to upload the ???${file.name}??? file: ${json.error}. Please check your internet connection.`);
	}

	const icon = `https://${url}/icon.26e159f8.svg`;
	const response = await fetch(icon, { method: "HEAD" });
	// console.log(response);

	return {
		"url": aurl,
		templateInfo: {
			service_icon: response.ok ? icon : null,
			service_url: LINK ? send.service : null,
			download_expiry_date: {
				timestamp: expiresAt.getTime()
			},
			download_limit: upload.downloads
		}
	};
}

browser.cloudFile.onFileUpload.addListener(uploaded);

/**
 * Cancel file upload.
 *
 * @param {Object} account
 * @param {number} id
 * @param {Object} tab
 * @returns {void}
 */
function canceled(account, id, tab) {
	console.log(account, id);
	const upload = uploads.get(id);
	if (upload) {
		if (!upload.canceled) {
			upload.canceled = true;
			notification("?????? Canceling upload", `Canceling upload of the ???${upload.file.name}??? file.`);
		} else {
			notification("??? Upload already canceled", `Error: Upload of the ???${upload.file.name}??? file was already canceled.`);
		}
	} else {
		notification("??? Unable to find file", "Error: Unable to find file to cancel upload. It may have already been deleted.");
	}
}

browser.cloudFile.onFileUploadAbort.addListener(canceled);

/**
 * Deleted uploaded file.
 *
 * @param {Object} account
 * @param {number} id
 * @param {Object} tab
 * @returns {void}
 */
async function deleted(account, id, tab) {
	console.log(account, id);
	let aaccount = await AddonSettings.get("account");
	aaccount = aaccount[account.id] || aaccount;
	const upload = uploads.get(id);
	if (!upload || !("id" in upload)) {
		notification("??? Unable to find file", "Error: Unable to find uploaded file to delete. It may have already been deleted.");
		return;
	}

	notification("?????? Deleting file", `Deleting the ???${upload.file.name}??? uploaded file.`);

	const url = `https://${new URL(aaccount.service).host}/api/delete/${upload.id}`;
	const fetchInfo = {
		// mode: "cors",
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ "owner_token": upload.owner_token, "delete_token": upload.owner_token }),
	};
	const response = await fetch(url, fetchInfo);
	// console.log(response);

	if (response.ok) {
		notification("??????? File deleted", `The ???${upload.file.name}??? uploaded file was successfully deleted.`);
	} else {
		const text = await response.text();
		console.error(text);
		notification("??? Unable delete file", `Error: Unable to delete the ???${upload.file.name}??? uploaded file: ${text}. It may have expired or already been deleted.`);
	}

	uploads.delete(id);
}

browser.cloudFile.onFileDeleted.addListener(deleted);

browser.cloudFile.getAllAccounts().then(async (accounts) => {
	const aaccount = await AddonSettings.get("account");
	// console.log(aaccount);

	for (const account of accounts) {
		// Use the existing or the default options
		await browser.cloudFile.updateAccount(account.id, { configured: true, uploadSizeLimit: (aaccount[account.id] || aaccount).size * 1024 * 1024 * 1024 });
	}
});

browser.cloudFile.onAccountAdded.addListener((account) => {
	const aaccount = AddonSettings.getDefaultValue("account");
	// console.log(aaccount);

	browser.cloudFile.updateAccount(account.id, { configured: true, uploadSizeLimit: aaccount.size * 1024 * 1024 * 1024 });
});

/**
 * Set settings.
 *
 * @param {Object} asettings
 * @returns {void}
 */
function setSettings(asettings) {
	SEND = asettings.send;
	LINK = asettings.link;
}

/**
 * Init.
 *
 * @returns {void}
 */
async function init() {
	const asettings = await AddonSettings.get("settings");

	setSettings(asettings);
}

init();

browser.runtime.onMessage.addListener(async (message, sender) => {
	// console.log(message);
	if (message.type === BACKGROUND) {
		setSettings(message.optionValue);
	} else if (message.type === VERIFY) {
		const response = {
			"type": VERIFY,
			"value": await checkServerVersion(message.service)
		};
		// console.log(response);
		return Promise.resolve(response);
	} else if (message.type === POPUP) {
		const promise = promiseMap.get(sender.tab.windowId);
		if (promise) {
			if (message.time || message.downloads || message.canceled) {
				promise.resolve(message);

				promiseMap.delete(sender.tab.windowId);
			} else {
				const response = {
					"type": POPUP,
					"send": promise.send,
					"file": promise.file
				};
				// console.log(response);
				return Promise.resolve(response);
			}
		}
	}
});
