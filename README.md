[![Actions Status](https://github.com/tdulcet/Thunderbird-Send/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/tdulcet/Thunderbird-Send/actions/workflows/ci.yml)

# Thunderbird Send
FileLink provider for Send

Copyright © 2020 Teal Dulcet

![](icons/icon.svg)

Thunderbird add-on/MailExtension to easily and securely encrypt and upload large attachments to any [Send service instance](https://github.com/timvisee/send-instances/#instances) (formerly [Firefox Send](https://github.com/mozilla/send)) and send the links via e-mail using the [CloudFile/FileLink API](https://thunderbird-webextensions.readthedocs.io/en/latest/cloudFile.html). Firefox Send was [discontinued by Mozilla](https://support.mozilla.org/kb/what-happened-firefox-send) in 2020. It is now maintained by @timvisee and called just [Send](https://github.com/timvisee/send), but soon will be [resurrected by Thunderbird](https://youtu.be/zt_2xiNjQBo).

* Enables simple, yet private file sharing with end-to-end encryption
* Files are securely [encrypted](https://github.com/timvisee/send/blob/master/docs/encryption.md) and uploaded locally in Thunderbird using the [Web Crypto](https://developer.mozilla.org/docs/Web/API/Web_Crypto_API) and [WebSocket](https://developer.mozilla.org/docs/Web/API/WebSockets_API) APIs
* Files are encrypted and uploaded in chunks, so it requires very little memory (RAM) for even large files
* Links are automatically added to the e-mail by Thunderbird when uploads finish, which includes the encryption secret needed to decrypt the file
* When recipient clicks a link, the file will securely download and decrypt locally in their browser using that encryption secret
* Links automatically expire after the download and time limit
* Desktop notifications when the uploads start and finish
* Specify the Send service instance(s) to use, defaults to the official one provided by @timvisee and sponsored by Thunderbird: https://send.vis.ee
* Specify the download and time limits for each file and defaults for each Send service instance
* Optionally protect each file with a password
* Supports securely generating a strong password or passphrase
* Supports the maximum file size supported by each Send service instance, currently 20 GiB
* Supports canceling the uploads
* Supports deleting the files from server after uploads finish
* Supports all v3 (or greater) Send service servers/instances
* Does NOT require a Firefox Account (FxA) or any other accounts, all uploads are anonymous
* Supports the light/dark mode of your system automatically
* Follows the [Thunderbird Photon Design](https://style.thunderbird.net/)
* Translated into seven languages

More information on the encryption used can be found in the official Send service documentation [here](https://github.com/timvisee/send/blob/master/docs/encryption.md).

❤️ Please visit [tealdulcet.com](https://www.tealdulcet.com/) to support this extension and my other software development.

This add-on is not affiliated with Mozilla, Firefox, Thunderbird or any Send service instance.

## Download

* [Addons.thunderbird.net](https://addons.thunderbird.net/thunderbird/addon/filelink-provider-for-send/) (ATN)

## Install from source

1. Clone the repository:
```bash
git clone --recurse-submodules https://github.com/tdulcet/Thunderbird-Send.git
```
2. Follow [these instructions](https://developer.thunderbird.net/add-ons/hello-world-add-on#installing) to install it in Thunderbird

## Contributing

### Translations

Translate this add-on using the online [WebExtension Translator](https://lusito.github.io/web-ext-translator/?gh=https://github.com/tdulcet/Thunderbird-Send/tree/main) and then open a pull request or issue with the resulting translations. Please see [this guide](https://github.com/TinyWebEx/common/blob/master/CONTRIBUTING.md#translations) or the [official documentation](https://developer.mozilla.org/docs/Mozilla/Add-ons/WebExtensions/Internationalization) for more information.

### Code

Pull requests welcome! Ideas for contributions:

* Convert to [Manifest V3](https://extensionworkshop.com/documentation/develop/manifest-v3-migration-guide/) (MV3)
* Refactor into more modules
* Open the popup in the compose window instead of a separate standalone window (see [Bug 1711446](https://bugzilla.mozilla.org/show_bug.cgi?id=1711446) and [Bug 1752114](https://bugzilla.mozilla.org/show_bug.cgi?id=1752114))
* Show the upload progress (also see [Bug 736169](https://bugzilla.mozilla.org/show_bug.cgi?id=736169))
* Support consolidation/zipping of multiple attachments into a single link (see [Bug 1856232](https://bugzilla.mozilla.org/show_bug.cgi?id=1856232))
* [Improve the management page](https://github.com/TinyWebEx/AutomaticSettings/issues/13)
	* [Check validity of input before saving values](https://github.com/TinyWebEx/AutomaticSettings/issues/14)
* Sync settings (see [bug 446444](https://bugzilla.mozilla.org/show_bug.cgi?id=446444))
* Support showing notifications in the notification bar (see [Bug 1674002](https://bugzilla.mozilla.org/show_bug.cgi?id=1674002))
* Support Firefox Account (FxA) authentication (see [here](https://gitlab.com/timvisee/ffsend/-/issues/58))
* Improve the performance
* Integrate this functionality into Thunderbird (see [Bug 1516252](https://bugzilla.mozilla.org/show_bug.cgi?id=1516252))
* Create a Firefox/Chrome add-on/WebExtension to both upload and download files
