"use strict";

// communication type
export const BACKGROUND = "background";
export const POPUP = "popup";
export const VERIFY = "verify";

const suffix_power_char = Object.freeze(["", "K", "M", "G", "T", "P", "E", "Z", "Y", "R", "Q"]);

export const numberFormat = new Intl.NumberFormat();

/**
 * Auto-scale number to unit.
 * Adapted from: https://github.com/tdulcet/Numbers-Tool/blob/master/numbers.cpp
 *
 * @param {number} number
 * @param {boolean} scale
 * @returns {string}
 */
export function outputunit(number, scale) {
	// return browser.messengerUtilities.formatFileSize(number);
	const scale_base = scale ? 1000 : 1024;

	let power = 0;
	while (Math.abs(number) >= scale_base) {
		++power;
		number /= scale_base;
	}

	let anumber = Math.abs(number);
	anumber += anumber < 10 ? 0.0005 : anumber < 100 ? 0.005 : anumber < 1000 ? 0.05 : 0.5;

	let str;

	if (number !== 0 && anumber < 1000 && power > 0) {
		str = numberFormat.format(number);

		const length = 5 + (number < 0);
		if (str.length > length) {
			const prec = anumber < 10 ? 3 : anumber < 100 ? 2 : 1;
			str = number.toLocaleString([], { maximumFractionDigits: prec });
		}
	} else {
		str = number.toLocaleString([], { maximumFractionDigits: 0 });
	}

	if (power > 0) {
		str += `\u{A0}${power < suffix_power_char.length ? suffix_power_char[power] : "(error)"}`;

		if (!scale) {
			str += "i";
		}
	}

	return str;
}
