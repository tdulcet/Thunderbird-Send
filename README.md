# Thunderbird Send
FileLink provider for Send

Copyright © 2020 Teal Dulcet

![](icons/icon.svg)

Thunderbird add-on/MailExtension to easily and securely encrypt and upload large attachments to any [Send service instance](https://github.com/timvisee/send-instances/#instances) (formerly [Firefox Send](https://github.com/mozilla/send)) and send the links via e-mail using the [CloudFile/FileLink API](https://thunderbird-webextensions.readthedocs.io/en/latest/cloudFile.html). Firefox Send was [discontinued by Mozilla](https://support.mozilla.org/en-US/kb/what-happened-firefox-send) in 2020. It is now maintained by @timvisee and called just [Send](https://github.com/timvisee/send).

* Enables simple, yet private file sharing with end-to-end encryption
* Files are securely [encrypted](https://github.com/timvisee/send/blob/master/docs/encryption.md) and uploaded locally in Thunderbird using the [Web Crypto](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API) and [WebSocket](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API) APIs
* Files are encrypted and uploaded in chunks, so it requires very little memory (RAM) for even large files
* Link(s) are automatically added to the e-mail by Thunderbird when upload(s) finish, which includes the encryption secret needed to decrypt the file(s)
* When recipient clicks the link(s), the files securely download and decrypt locally in their browser using that encryption secret
* Link(s) automatically expire after the download and time limit
* Desktop notifications when the upload(s) start and finish
* Users can specify the Send service instance(s) to use, defaults to the one provided by @timvisee: https://send.vis.ee
* Users can specify the download and time limits for each file and defaults for each Send service instance
* Supports the maximum file size supported by each Send service instance, currently 10 GiB
* Supports canceling the upload(s)
* Supports deleting the file(s) from server after upload(s) finish
* Supports all v3 (or greater) Send service servers/instances
* Does NOT require a Firefox Account (FxA) or any other accounts, all uploads are anonymous
* Supports the light/dark mode of your system automatically
* Follows the [Thunderbird Photon Design](https://style.thunderbird.net/)

More information on the encryption used can be found in the official Send service documentation [here](https://github.com/timvisee/send/blob/master/docs/encryption.md).

❤️ Please visit [tealdulcet.com](https://www.tealdulcet.com/) to support this extension and my other software development.

⬇️ Download from [Addons.thunderbird.net](https://addons.thunderbird.net/en-US/thunderbird/addon/filelink-provider-for-send/) (ATN).

This add-on is not affiliated with Mozilla, Firefox or any Send service instance.

## Contributing

Pull requests welcome! Ideas for contributions:

* Allow users to specify a password for each file (see [Bug 1711446](https://bugzilla.mozilla.org/show_bug.cgi?id=1711446))
* Show the upload progress (also see [Bug 736169](https://bugzilla.mozilla.org/show_bug.cgi?id=736169))
* [Improve the management page](https://github.com/TinyWebEx/AutomaticSettings/issues/13)
	* [Check validity of input before saving values](https://github.com/TinyWebEx/AutomaticSettings/issues/14)
* Add more information to the e-mail with the link, such as the download limit and expiry time (see [Bug 1643729](https://bugzilla.mozilla.org/show_bug.cgi?id=1643729))
* Support showing notifications in the notification bar (see [Bug 1674002](https://bugzilla.mozilla.org/show_bug.cgi?id=1674002))
* Support Firefox Account (FxA) authentication (see [here](https://gitlab.com/timvisee/ffsend/-/issues/58))
* Improve the performance
* Integrate this functionality into Thunderbird (see [Bug 1516252](https://bugzilla.mozilla.org/show_bug.cgi?id=1516252))
* Create a Firefox/Chrome add-on/WebExtension to both upload and download files
* Localize the add-on
