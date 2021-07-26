/**
 * Starter module for addon settings site.
 *
 * @requires modules/OptionHandler
 */

import * as AddonSettings from "/common/modules/AddonSettings/AddonSettings.js";
import * as AutomaticSettings from "/common/modules/AutomaticSettings/AutomaticSettings.js";

import * as CustomOptionTriggers from "./modules/CustomOptionTriggers.js";

// init modules
CustomOptionTriggers.registerTrigger();
AutomaticSettings.setDefaultOptionProvider(AddonSettings.getDefaultValue);
AutomaticSettings.init();

document.getElementById("settings").addEventListener("click", (event) => {
	// disable button (which triggered this) until process is finished
	event.target.disabled = true;

	browser.runtime.openOptionsPage().finally(() => {
		// re-enable button
		event.target.disabled = false;
	});
});
