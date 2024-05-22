"use strict";

import * as AddonSettings from "/common/modules/AddonSettings/AddonSettings.js";

//const TITLE = "FileLink provider for Send";
const TITLE = browser.i18n.getMessage("extensionName");

const NONCE_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_LENGTH = 16;
const MODE_ENCRYPT = "encrypt";
const MODE_DECRYPT = "decrypt";
const ECE_RECORD_SIZE = 1024 * 64;

const uploads = new Map();

const encoder = new TextEncoder();

const numberFormat1 = new Intl.NumberFormat([], { style: "unit", unit: "day", unitDisplay: "long" });
const numberFormat2 = new Intl.NumberFormat([], { style: "unit", unit: "hour", unitDisplay: "long" });
const numberFormat3 = new Intl.NumberFormat([], { style: "unit", unit: "minute", unitDisplay: "long" });
const numberFormat4 = new Intl.NumberFormat([], { style: "unit", unit: "second", unitDisplay: "long" });

const formatter = new Intl.ListFormat();

const promiseMap = new Map();
const tabs = new Map();

const notifications = new Map();

// Display notifications
let SEND = true;
// Display link to Send service
let LINK = false;
// Use compose action popups in the compose window
let composeAction = false;

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
			type: "basic",
			iconUrl: browser.runtime.getURL("icons/icon.svg"),
			title,
			message,
			eventTime: date
		});
	}
}

browser.notifications.onClicked.addListener((notificationId) => {
	const url = notifications.get(notificationId);

	if (url) {
		browser.tabs.create({ url });
		// browser.windows.openDefaultBrowser(url);
	}
});

browser.notifications.onClosed.addListener((notificationId) => {
	notifications.delete(notificationId);
});

/**
 * Get seconds as digital clock.
 *
 * @param {number} sec_num
 * @returns {string}
 */
function getSecondsAsDigitalClock(sec_num) {
	// console.log(sec_num);
	const d = Math.floor(sec_num / 86400);
	const h = Math.floor(sec_num % 86400 / 3600);
	const m = Math.floor(sec_num % 86400 % 3600 / 60);
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
 * @param {Uint8Array} array
 * @returns {string}
 */
function arrayToB64(array) {
	return btoa(String.fromCharCode(...array))
		.replaceAll("+", "-")
		.replaceAll("/", "_")
		.replaceAll("=", "");
}

/**
 * Delay.
 * Adapted from: https://github.com/mozilla/send/blob/master/app/utils.js
 *
 * @param {number} [delay]
 * @returns {Promise<void>}
 */
function delay(delay = 100) {
	return new Promise((resolve) => {
		setTimeout(resolve, delay);
	});
}

/**
 * Concatenate arrays.
 * Adapted from: https://github.com/mozilla/send/blob/master/app/utils.js
 *
 * @param {Uint8Array} b1
 * @param {Uint8Array} b2
 * @returns {Uint8Array}
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
 * @returns {ArrayBuffer}
 */
function generateSalt(len) {
	const randSalt = new Uint8Array(len);
	crypto.getRandomValues(randSalt);
	return randSalt.buffer;
}

// Adapted from: https://github.com/mozilla/send/blob/master/app/ece.js
class ECETransformer {
	/**
	 * @param {string} mode
	 * @param {Uint8Array} ikm
	 * @param {number} rs
	 * @param {ArrayBuffer} salt
	 */
	constructor(mode, ikm, rs, salt) {
		this.mode = mode;
		this.prevChunk = null;
		this.seq = 0;
		this.firstchunk = true;
		this.rs = rs;
		this.ikm = ikm.buffer;
		this.salt = salt;
	}

	/**
	 * @returns {Promise<CryptoKey>}
	 */
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

	/**
	 * @returns {Promise<ArrayBuffer>}
	 */
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

	/**
	 * @param {number} seq
	 * @returns {Uint8Array}
	 */
	generateNonce(seq) {
		if (seq > 0xFFFFFFFF) {
			throw new Error("record sequence number exceeds limit");
		}
		const nonce = new DataView(this.nonceBase.slice());
		const m = nonce.getUint32(nonce.byteLength - 4);
		const xor = (m ^ seq) >>> 0; // forces unsigned int xor
		nonce.setUint32(nonce.byteLength - 4, xor);
		return new Uint8Array(nonce.buffer);
	}

	/**
	 * @param {Uint8Array} data
	 * @param {boolean} isLast
	 * @returns {Uint8Array}
	 */
	pad(data, isLast) {
		const len = data.length;
		if (len + TAG_LENGTH >= this.rs) {
			throw new Error("data too large for record size");
		}

		if (isLast) {
			return concat(data, Uint8Array.of(2));
		}
		const padding = new Uint8Array(this.rs - len - TAG_LENGTH);
		padding[0] = 1;
		return concat(data, padding);

	}

	/**
	 * @param {Uint8Array} data
	 * @param {boolean} isLast
	 * @returns {Uint8Array}
	 */
	unpad(data, isLast) {
		for (let i = data.length - 1; i >= 0; --i) {
			if (data[i]) {
				if (isLast) {
					if (data[i] !== 2) {
						throw new Error("delimiter of final record is not 2");
					}
				} else if (data[i] !== 1) {
					throw new Error("delimiter of not final record is not 1");
				}
				return data.slice(0, i);
			}
		}
		throw new Error("no delimiter found");
	}

	/**
	 * @returns {Uint8Array}
	 */
	createHeader() {
		const nums = new DataView(new ArrayBuffer(5));
		nums.setUint32(0, this.rs);
		return concat(new Uint8Array(this.salt), new Uint8Array(nums.buffer));
	}

	/**
	 * @param {Uint8Array} buffer
	 * @returns {Object}
	 */
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

	/**
	 * @param {Uint8Array} buffer
	 * @param {number} seq
	 * @param {boolean} isLast
	 * @returns {Promise<Uint8Array>}
	 */
	async encryptRecord(buffer, seq, isLast) {
		const nonce = this.generateNonce(seq);
		const encrypted = await crypto.subtle.encrypt(
			{ name: "AES-GCM", iv: nonce },
			this.key,
			this.pad(buffer, isLast)
		);
		return new Uint8Array(encrypted);
	}

	/**
	 * @param {BufferSource} buffer
	 * @param {number} seq
	 * @param {boolean} isLast
	 * @returns {Promise<Uint8Array>}
	 */
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

	/**
	 * @param {TransformStreamDefaultController} controller
	 */
	async start(controller) {
		if (this.mode === MODE_ENCRYPT) {
			this.key = await this.generateKey();
			this.nonceBase = await this.generateNonceBase();
			controller.enqueue(this.createHeader());
		} else if (this.mode !== MODE_DECRYPT) {
			throw new Error("mode must be either encrypt or decrypt");
		}
	}

	/**
	 * @param {boolean} isLast
	 * @param {TransformStreamDefaultController} controller
	 */
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

	/**
	 * @param {Uint8Array} chunk
	 * @param {TransformStreamDefaultController} controller
	 */
	async transform(chunk, controller) {
		if (!this.firstchunk) {
			await this.transformPrevChunk(false, controller);
		}
		this.firstchunk = false;
		this.prevChunk = new Uint8Array(chunk.buffer);
	}

	/**
	 * @param {TransformStreamDefaultController} controller
	 */
	async flush(controller) {
		// console.log('ece stream ends')
		if (this.prevChunk) {
			await this.transformPrevChunk(true, controller);
		}
	}
}

// Adapted from: https://github.com/mozilla/send/blob/master/app/ece.js
class StreamSlicer {
	/**
	 * @param {number} rs
	 * @param {string} mode
	 */
	constructor(rs, mode) {
		this.mode = mode;
		this.rs = rs;
		this.chunkSize = mode === MODE_ENCRYPT ? rs - 17 : 21;
		this.partialChunk = new Uint8Array(this.chunkSize); // where partial chunks are saved
		this.offset = 0;
	}

	/**
	 * @param {Uint8Array} buf
	 * @param {TransformStreamDefaultController} controller
	 */
	send(buf, controller) {
		controller.enqueue(buf);
		if (this.chunkSize === 21 && this.mode === MODE_DECRYPT) {
			this.chunkSize = this.rs;
		}
		this.partialChunk = new Uint8Array(this.chunkSize);
		this.offset = 0;
	}

	// reslice input into record sized chunks
	/**
	 * @param {Uint8Array} chunk
	 * @param {TransformStreamDefaultController} controller
	 */
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

	/**
	 * @param {TransformStreamDefaultController} controller
	 */
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
 * @param {ReadableStream} readable
 * @param {Transformer} transformer
 * @returns {ReadableStream}
 */
function transformStream(readable, transformer) {
	return readable.pipeThrough(new TransformStream(transformer));
}

/**
 * Check Send server version.
 *
 * @param {string} service
 * @returns {Promise<boolean>}
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
		if (version && version.startsWith("v") && Number.parseInt(version.slice(1).split(".")[0], 10) >= 3) {
			return true;
		}
		//notification("❌ Unsupported Send server version", `Error: The “${service}” Send service instance has an unsupported server version: ${version}. This extension requires at least version 3.`);
		notification(browser.i18n.getMessage("notifUnsupportedVersionTitle"), `${browser.i18n.getMessage("notifUnsupportedVersionMessage", [service, version])}`);
		return false;

	}
	const text = await response.text();
	console.error(text);
	//notification("❌ Unable to determine Send server version", `Error: Unable to determine the “${service}” Send service instance server version. Please check your internet connection and settings.`);
	notification(browser.i18n.getMessage("notifUnableVersionTitle"), `${browser.i18n.getMessage("notifUnableVersionMessage", service)}`);
	return false;

}

/**
 * Upload file.
 *
 * @param {Object} account
 * @param {Object} fileInfo
 * @param {Object} tab
 * @param {Object} relatedFileInfo
 * @returns {Promise<Object>}
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
		name: name || data.name,
		size: data.size,
		type: data.type || "application/octet-stream"
	};
	upload.file = file;
	uploads.set(id, upload);

	let message = null;
	if (tab && composeAction) {
		const tabId = tab.id;

		if (!tabs.has(tabId)) {
			tabs.set(tabId, Promise.resolve());
		}

		const promise = tabs.get(tabId).then(async () => {
			browser.composeAction.enable(tabId);
			browser.composeAction.setBadgeText({
				text: numberFormat.format(promiseMap.size + 1),
				// tabId
			});

			await delay(1000);

			await browser.composeAction.openPopup().catch((error) => {
				console.error(error);

				//notification("ℹ️ Open compose action popup to continue", "The add-on was unable to open the popup directly, so please click the “Thunderbird Send” button in the compose window toolbar to continue.");
				notification(browser.i18n.getMessage("notifOpenPopupTitle"), browser.i18n.getMessage("notifOpenPopupMessage"));
			});


			message = await new Promise((resolve) => {
				promiseMap.set(tabId, { resolve, send, file });
			});

			browser.composeAction.setBadgeText({
				text: promiseMap.size ? numberFormat.format(promiseMap.size) : null,
				// tabId
			});
			browser.composeAction.disable(tabId);
		});

		tabs.set(tabId, promise);

		await promise;
	} else {
		const awindow = await browser.windows.create({
			url: browser.runtime.getURL("popup/popup.html"),
			type: "popup",
			// Should not be needed: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/windows/create#parameters
			allowScriptsToClose: true
		});
		console.log(awindow);

		const tabId = awindow.tabs[0].id;

		message = await new Promise((resolve) => {
			promiseMap.set(tabId, { resolve, send, file });
		});
	}

	if (message.canceled) {
		upload.canceled = message.canceled;
	} else {
		upload.time = message.time;
		upload.downloads = message.downloads;
		upload.password = message.password;
	}
	// console.log(message);

	if (upload.canceled) {
		return { aborted: true };
	}

	//notification("📤 Encrypting and uploading attachment", `📛: ${file.name}\n⬆️: ${outputunit(file.size, false)}B${file.size >= 1000 ? ` (${outputunit(file.size, true)}B)` : ""}`);
	notification(browser.i18n.getMessage("notifUploadTitle"), `📛 : ${file.name}\n⬆️ : ${outputunit(file.size, false)}${browser.i18n.getMessage("popupB")}${file.size >= 1000 ? ` (${outputunit(file.size, true)}${browser.i18n.getMessage("popupB")})` : ""}`);

	const start = performance.now();

	if (!await checkServerVersion(send.service)) {
		return { aborted: true };
	}

	if (upload.canceled) {
		//notification("❌ Upload of attachment aborted", `Upload of the “${file.name}” file was aborted.`);
		notification(browser.i18n.getMessage("notifUploadCancelTitle"), `${browser.i18n.getMessage("notifUploadCancelMessage", file.name)}`);
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
				name: "HKDF",
				salt: new Uint8Array(),
				info: encoder.encode("metadata"),
				hash: "SHA-256"
			},
			secretKey,
			{
				name: "AES-GCM",
				length: 128
			},
			false,
			["encrypt", "decrypt"]
		);
	});
	const metadata = await crypto.subtle.encrypt(
		{
			name: "AES-GCM",
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
				name: "HKDF",
				salt: new Uint8Array(),
				info: encoder.encode("authentication"),
				hash: "SHA-256"
			},
			secretKey,
			{
				name: "HMAC",
				hash: { name: "SHA-256" }
			},
			true,
			["sign"]
		);
	});
	const rawAuth = await crypto.subtle.exportKey("raw", authKey);

	const aurl = new URL(send.service).host;
	const ws = await new Promise((resolve) => {
		const ws = new WebSocket(`wss://${aurl}/api/ws`);
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
		//notification("❌ Unable upload attachment", `Error: Unable to upload the “${file.name}” file: ${uploadInfo.error}. The download or time limit is likely above the maximum supported by this Send service instance.`);
		notification(browser.i18n.getMessage("notifUploadUnableTitle"), `${browser.i18n.getMessage("notifUploadUnableMessage", [file.name, uploadInfo.error])}`);
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
		//notification("❌ Upload of attachment aborted", `Upload of the “${file.name}” file was aborted.`);
		notification(browser.i18n.getMessage("notifUploadCancelTitle"), `${browser.i18n.getMessage("notifUploadCancelMessage", file.name)}`);
		return { aborted: true };
	}

	const json = await completedResponse;
	upload.id = uploadInfo.id;
	upload.owner_token = uploadInfo.ownerToken;

	if (![WebSocket.CLOSED, WebSocket.CLOSING].includes(ws.readyState)) {
		ws.close();
	}

	const date = new Date();
	date.setMinutes(date.getMinutes() + upload.time);
	const expiresAt = date.getTime();

	const url = `${uploadInfo.url}#${arrayToB64(rawSecret)}`;
	// console.info(url);

	if (upload.password) {
		const authKey = await crypto.subtle.importKey("raw", encoder.encode(upload.password), { name: "PBKDF2" }, false, [
			"deriveKey"
		]).then((passwordKey) =>
			crypto.subtle.deriveKey(
				{
					name: "PBKDF2",
					salt: encoder.encode(url),
					iterations: 100,
					hash: "SHA-256"
				},
				passwordKey,
				{
					name: "HMAC",
					hash: "SHA-256"
				},
				true,
				["sign"]
			)
		);
		const rawAuth = await crypto.subtle.exportKey("raw", authKey);

		const aaurl = `https://${aurl}/api/password/${upload.id}`;
		const fetchInfo = {
			// mode: "cors",
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ owner_token: upload.owner_token, auth: arrayToB64(new Uint8Array(rawAuth)) })
		};
		const response = await fetch(aaurl, fetchInfo);
		// console.log(response);

		if (!response.ok) {
			//notification("❌ Unable add password to attachment", `Error: Unable to add password to the “${file.name}” file.`);
			notification(browser.i18n.getMessage("notifUnablePasswordTitle"), `${browser.i18n.getMessage("notifUnablePasswordMessage", file.name)}`);
		}
	}

	const end = performance.now();
	console.timeEnd(id);

	if (json.ok) {
		//notification("🔗 Attachment encrypted and uploaded", `The “${file.name}” file was successfully encrypted and uploaded in ${getSecondsAsDigitalClock(Math.floor((end - start) / 1000))}! Expires after:\n⬇️: ${numberFormat.format(upload.downloads)}\n⏲️: ${getSecondsAsDigitalClock(upload.time * 60)}\n\n${url}`);
		notification(browser.i18n.getMessage("notifUploadDoneTitle"), `${browser.i18n.getMessage("notifUploadDoneMessage", getSecondsAsDigitalClock(Math.floor((end - start) / 1000)))}\n⬇️ : ${numberFormat.format(upload.downloads)}\n⏲️ : ${getSecondsAsDigitalClock(upload.time * 60)}\n\n${url}`);
	} else {
		//notification("❌ Unable upload attachment", `Error: Unable to upload the “${file.name}” file: ${json.error}. Please check your internet connection.`);
		notification(browser.i18n.getMessage("notifUploadUnableTitle"), `${browser.i18n.getMessage("notifUploadErrorMessage", [file.name, json.error])}`);
	}

	const icon = `https://${aurl}/icon.718f87fb.svg`;
	const response = await fetch(icon, { method: "HEAD" });
	// console.log(response);

	return {
		url,
		templateInfo: {
			service_icon: response.ok ? icon : null,
			service_url: LINK ? send.service : null,
			download_expiry_date: {
				timestamp: expiresAt
			},
			download_limit: upload.downloads,
			download_password_protected: Boolean(upload.password)
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
			//notification("ℹ️ Canceling upload", `Canceling upload of the “${upload.file.name}” file.`);
			notification(browser.i18n.getMessage("notifUploadCancelingTitle"), `${browser.i18n.getMessage("notifUploadCancelingMessage", upload.file.name)}`);
		} else {
			//notification("❌ Upload already canceled", `Error: Upload of the “${upload.file.name}” file was already canceled.`);
			notification(browser.i18n.getMessage("notifCancelAlreadyTitle"), `${browser.i18n.getMessage("notifCancelAlreadyMessage", upload.file.name)}`);
		}
	} else {
		//notification("❌ Unable to find file", "Error: Unable to find file to cancel upload. It may have already been deleted.");
		notification(browser.i18n.getMessage("notifNotFoundTitle"), browser.i18n.getMessage("notifNotFoundCancelMessage"));
	}
}

browser.cloudFile.onFileUploadAbort.addListener(canceled);

/**
 * Deleted uploaded file.
 *
 * @param {Object} account
 * @param {number} id
 * @param {Object} tab
 * @returns {Promise<void>}
 */
async function deleted(account, id, tab) {
	console.log(account, id);
	let aaccount = await AddonSettings.get("account");
	aaccount = aaccount[account.id] || aaccount;
	const upload = uploads.get(id);
	if (!upload || !("id" in upload)) {
		//notification("❌ Unable to find file", "Error: Unable to find uploaded file to delete. It may have already been deleted.");
		notification(browser.i18n.getMessage("notifNotFoundTitle"), browser.i18n.getMessage("notifNotFoundDeleteMessage"));
		return;
	}

	//notification("ℹ️ Deleting file", `Deleting the “${upload.file.name}” uploaded file.`);
	notification(browser.i18n.getMessage("notifDeletingTitle"), `${browser.i18n.getMessage("notifDeletingMessage", upload.file.name)}`);

	const url = `https://${new URL(aaccount.service).host}/api/delete/${upload.id}`;
	const fetchInfo = {
		// mode: "cors",
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ owner_token: upload.owner_token, delete_token: upload.owner_token })
	};
	const response = await fetch(url, fetchInfo);
	// console.log(response);

	if (response.ok) {
		//notification("🗑️ File deleted", `The “${upload.file.name}” uploaded file was successfully deleted.`);
		notification(browser.i18n.getMessage("notifDeleteSuccessTitle"), `${browser.i18n.getMessage("notifDeleteSuccessMessage", upload.file.name)}`);
	} else {
		const text = await response.text();
		console.error(text);
		//notification("❌ Unable delete file", `Error: Unable to delete the “${upload.file.name}” uploaded file: ${text}. It may have expired or already been deleted.`);
		notification(browser.i18n.getMessage("notifDeleteUnableTitle"), `${browser.i18n.getMessage("notifDeleteUnableMessage", [upload.file.name, text])}`);
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
	composeAction = asettings.composeAction;
}

/**
 * Init.
 *
 * @returns {Promise<void>}
 */
async function init() {
	browser.composeAction.disable();

	const asettings = await AddonSettings.get("settings");

	setSettings(asettings);
}

init();

browser.runtime.onMessage.addListener(async (message, sender) => {
	// console.log(message);
	switch (message.type) {
		case BACKGROUND: {
			setSettings(message.optionValue);
			break;
		}
		case VERIFY: {
			const response = {
				type: VERIFY,
				value: await checkServerVersion(message.service)
			};
			// console.log(response);
			return response;
		}
		case POPUP: {
			const promise = promiseMap.get(sender.tab.id);
			if (promise) {
				if (message.time || message.downloads || message.canceled) {
					promise.resolve(message);

					promiseMap.delete(sender.tab.id);
				} else {
					const response = {
						type: POPUP,
						send: promise.send,
						file: promise.file
					};
					// console.log(response);
					return response;
				}
			}
			break;
		}
		// No default
	}
});

browser.runtime.onInstalled.addListener((details) => {
	console.log(details);

	const manifest = browser.runtime.getManifest();
	switch (details.reason) {
		case "install":
			//notification(`🎉 ${manifest.name} installed`, `Thank you for installing the “${TITLE}” add-on!\nVersion: ${manifest.version}`);
			notification(`🎉 ${browser.i18n.getMessage("notifInstallTitle", manifest.name)}`, `${browser.i18n.getMessage("notifInstallMessage", [TITLE, manifest.version])}`);
			break;
		case "update":
			if (SEND) {
				browser.notifications.create({
					type: "basic",
					iconUrl: browser.runtime.getURL("icons/icon.svg"),
					//title: `✨ ${manifest.name} updated`,
					title: `✨ ${browser.i18n.getMessage("notifUpdateTitle", manifest.name)}`,
					//message: `The “${TITLE}” add-on has been updated to version ${manifest.version}. Click to see the release notes.\n\n❤️ Huge thanks to the generous donors that have allowed me to continue to work on this extension!`
					message: `${browser.i18n.getMessage("notifUpdateMessage", [TITLE, manifest.version])}`
				}).then((notificationId) => {
					const url = `https://addons.thunderbird.net/thunderbird/addon/filelink-provider-for-send/versions/${manifest.version}`;
					notifications.set(notificationId, url);
				});
			}
			break;
	}
});

browser.runtime.setUninstallURL("https://forms.gle/6ysbRNd7T1z7VLQBA");
