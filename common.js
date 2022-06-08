"use strict";

// communication type
const BACKGROUND = "background";
const POPUP = "popup";
const VERIFY = "verify";

const suffix_power_char = Object.freeze(["", "K", "M", "G", "T", "P", "E", "Z", "Y"]);

/**
 * Auto-scale number to unit.
 * Adapted from: https://github.com/tdulcet/Numbers-Tool/blob/master/numbers.cpp
 *
 * @param {number} number
 * @param {boolean} scale
 * @returns {string}
 */
function outputunit(number, scale) {
	let str = "";

	const scale_base = scale ? 1000 : 1024;

	let power = 0;
	while (Math.abs(number) >= scale_base) {
		++power;
		number /= scale_base;
	}

	let anumber = Math.abs(number);
	anumber += anumber < 10 ? 0.0005 : (anumber < 100 ? 0.005 : (anumber < 1000 ? 0.05 : 0.5));

	if (number !== 0 && anumber < 1000 && power > 0) {
		str = number.toString();

		const length = 5 + (number < 0 ? 1 : 0);
		if (str.length > length) {
			const prec = anumber < 10 ? 3 : (anumber < 100 ? 2 : 1);
			str = number.toFixed(prec);
		}
	} else {
		str = number.toFixed(0);
	}

	str = str.toLocaleString();

	str += ` ${power < 9 ? suffix_power_char[power] : "(error)"}`;

	if (!scale && power > 0) {
		str += "i";
	}

	return str;
}
