const fs = require('fs-extra');
const Path = require('path');
const fetch = require('node-fetch');
const sanitize = require("sanitize-filename");
const token = require('./generators/token');
const zwsGen = require('./generators/zws');
const randomGen = require('./generators/random');
const gfyGen = require('./generators/gfycat');
const { useSsl, port, domain, isProxied, diskFilePath, s3bucket, s3endpoint } = require('./config.json');
const { HTTP, HTTPS, KILOBYTES } = require('./MagicNumbers.json');

const path = (...paths) => Path.join(__dirname, ...paths);

function getSafeExt(type) {
	return type.includes('video') ? '.mp4' : type.includes('gif') ? '.gif' : '';
}

function getS3url(s3key, type) {
	return `https://${s3bucket}.${s3endpoint}/${s3key}${getSafeExt(type)}`;
}

const idModes = {
	zws: 'zws',     // Zero-width spaces (see: https://zws.im/)
	og: 'original', // Use original uploaded filename
	r: 'random',    // Use a randomly generated ID with a mixed-case alphanumeric character set
	gfy: 'gfycat'   // Gfycat-style ID's (https://gfycat.com/unsungdiscretegrub)
};

const GENERATORS = new Map();
GENERATORS.set(idModes.zws, zwsGen);
GENERATORS.set(idModes.r, randomGen);
GENERATORS.set(idModes.gfy, gfyGen);

module.exports = {
	path,
	log: console.log,
	saveData: (data) => fs.writeJsonSync(Path.join(__dirname, 'data.json'), data, { spaces: 4 }),
	verify: (req, users) => req.headers.authorization && Object.prototype.hasOwnProperty.call(users, req.headers.authorization),
	getTrueHttp: () => ('http').concat(useSsl ? 's' : '').concat('://'),
	getTrueDomain: (d = domain) => d.concat((port === HTTP || port === HTTPS || isProxied) ? '' : `:${port}`),
	renameFile: (req, newName) => new Promise((resolve, reject) => {
		try {
			const paths = [req.file.destination, newName];
			fs.rename(path(req.file.path), path(...paths));
			req.file.path = Path.join(...paths);
			resolve();
		} catch (err) {
			reject(err);
		}
	}),
	generateToken: () => token(),
	generateId: (mode, length, gfyLength, originalName) => (GENERATORS.has(mode) ? GENERATORS.get(mode)({ length, gfyLength }) : originalName),
	formatBytes: (bytes, decimals = 2) => { // skipcq: JS-0074
		if (bytes === 0) return '0 Bytes';
		const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
		const i = Math.floor(Math.log(bytes) / Math.log(KILOBYTES));
		return parseFloat((bytes / Math.pow(KILOBYTES, i)).toFixed(decimals < 0 ? 0 : decimals)).toString().concat(` ${sizes[i]}`);
	},
	randomHexColour: () => { // From: https://www.geeksforgeeks.org/javascript-generate-random-hex-codes-color/
		const letters = "0123456789ABCDEF";
		let colour = '#';
		for (let i = 0; i < 6; i++) // skipcq: JS-0074
			colour += letters[(Math.floor(Math.random() * letters.length))];
		return colour;
	},
	arrayEquals: (arr1, arr2) => arr1.length === arr2.length && arr1.slice().sort().every((value, index) => value === arr2.slice().sort()[index]),
	downloadTempS3: (file) => new Promise((resolve, reject) =>
		fetch(getS3url(file.randomId, file.mimetype))
			.then((f2) => f2.body.pipe(fs.createWriteStream(Path.join(__dirname, diskFilePath, sanitize(file.originalname))).on('close', () => resolve())))
			.catch(reject)),
	getS3url,
	getSafeExt,
	sanitize
}
