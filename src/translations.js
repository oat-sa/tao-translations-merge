/**
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License
 * as published by the Free Software Foundation; under version 2
 * of the License (non-upgradable).
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
 *
 * Copyright (c) 2019 Open Assessment Technologies SA;
 */

/**
 * Provides methods to compare, diff and merge translations
 *
 * @author Ricardo Proença <ricardo@taotesting.com>
 */

const {createReadStream, createWriteStream, unlink, renameSync} = require('fs');
const {join, normalize} = require('path');
const readline = require('readline');

const log = require('./log.js');
const config = require('./config')(process.cwd(), '.content.json');

/**
 * Get the translations instance
 * @param {Object} origin - object representing tao instance translations
 * @param {Object} available - object representing available translations
 * @returns {Promise} resolves with a result object
 */
module.exports = function taoTranslationMergeFactory(origin, available) {
    let content = {
        missing: [],
        available: [],
        diff: []
    };

    return {

        /**
         * Set the translations content object
         * @param {Object} searchMode - Object to pass options for searching translations
         */
        async setupTranslationsContent(searchMode) {
            log.info(`Searching for missing translations in [ ${origin.path} ]`);
            const promises = origin.files.map(async (file) => {
                const emptyMessages = await this.getMissingTranslations(join(origin.path, file), searchMode);
                if (emptyMessages.length) {
                    content.missing.push({
                        file: normalize(file),
                        messages: emptyMessages
                    });
                }
            });
            await Promise.all(promises);

            content.missing.map((entry) => {
                log.doing(`Found ${entry.messages.length} missing translations in [ ${entry.file} ]`);
            });

            log.info(`Searching for available translations in [ ${available.path} ]`);
            const availableContentPromises = available.files.map(async (file) => {
                content.available.push({
                    file: normalize(file),
                    messages: await this.getAvailableTranslations(join(available.path, file))
                });
            });
            await Promise.all(availableContentPromises);

            content.available.map((entry) => {
                log.doing(`Found ${Object.keys(entry.messages).length} available translations in [ ${entry.file} ]`);
            });

            await config.write(content);
        },

        /**
         * Get missing translations for file
         * @param {String} file - name of the file
         * @param {Object} searchMode - Object to pass options for searching translations
         */
        async getMissingTranslations(file, searchMode) {
            return new Promise(function (resolve, reject) {
                let emptyMessages = [];
                let lastIdLine = null;

                const readInterface = readline.createInterface({
                    input: createReadStream(file)
                });

                readInterface.on('line', (line) => {
                    if (line.startsWith('msgid ""')) {
                        lastIdLine = null;
                        return;
                    }

                    if (line.startsWith('msgid ')) {
                        lastIdLine = line;
                    }

                    if ((line.startsWith('msgstr ""') || line.endsWith(`${searchMode.endsWith}"`)) && lastIdLine) {
                        emptyMessages.push(lastIdLine);
                    }
                });

                readInterface.on('close', function () {
                    resolve(emptyMessages);
                });

                readInterface.on('error', function () {
                    reject(false);
                });
            });
        },

        /**
         * Get available translations in file
         * @param {String} file - name of the file
         */
        async getAvailableTranslations(file) {
            return new Promise(function (resolve, reject) {
                let emptyMessages = {};
                let lastIdLine = null;

                const readInterface = readline.createInterface({
                    input: createReadStream(file)
                });

                readInterface.on('line', (line) => {
                    if (line.startsWith('msgstr ') && lastIdLine) {
                        emptyMessages[lastIdLine] = line;
                        lastIdLine = null;
                        return;
                    }

                    if (line.startsWith('msgid ""')) {
                        lastIdLine = null;
                    }

                    if (line.startsWith('msgid ')) {
                        lastIdLine = line;
                    }
                });

                readInterface.on('close', function () {
                    resolve(emptyMessages);
                });

                readInterface.on('error', function () {
                    reject(false);
                });
            });
        },

        /**
         * Build diff the missing and available translations
         */
        async buildDiff() {
            content.missing.map((entry) => {
                const fileName = entry.file;
                if (entry.messages.length) {
                    const newEntry = {
                        file: fileName,
                        messages: []
                    };
                    entry.messages.map((msg) => {
                        const readyMsg = {};
                        readyMsg[msg] = this.getAvailableMessage(fileName, msg);
                        newEntry.messages.push(readyMsg);
                    });

                    content.diff.push(newEntry);
                }
            });

            content.diff.map((entry) => {
                log.doing(`Found ${Object.keys(entry.messages).length} messages that can be translated (if available) in [ ${entry.file} ]`);
            });

            await config.write(content);
        },

        /**
         * Gets the available message for the msgId
         *
         * @param {String} fileName - name of the file
         * @param {String} msgId - msg id
         * @returns {String}
         */
        getAvailableMessage(fileName, msgId) {
            const found = content.available.filter((entry) => {
                return entry.file === fileName;
            })[0];

            if (found) {
                const msgStr = found.messages[msgId];
                if (!msgStr) {
                    log.warn(`Cannot find available translation for [${msgId}] in [ ${fileName} ]`);
                }

                return msgStr || 'msgstr ""';
            }

            log.warn(`Cannot find [${fileName}] file in available translations`);
            return '';
        },

        /**
         * Merge available content into missing content
         */
        async merge() {
            const promises = content.diff.map(async (entry) => {
                await this.mergeContent(entry);
            });
            await Promise.all(promises);
        },

        /**
         * Merge file content
         * @param {object} entry - Information about files and messages to merge
         * @param {String} entry.file - The name of the file
         * @param {Array.<String>}entry.messages - The messages to merge
         */
        async mergeContent(entry) {
            const newFile = join(origin.path, entry.file);
            const oldFile = `${newFile}.bak`;

            return new Promise(function (resolve, reject) {
                let stringToWrite = '';

                renameSync(newFile, oldFile);

                const readInterface = readline.createInterface({
                    input: createReadStream(oldFile)
                });

                const writeInterface = createWriteStream(newFile);

                readInterface.on('line', (line) => {
                    if (stringToWrite) {
                        writeInterface.write(`${stringToWrite}\n`);
                        stringToWrite = '';
                        return;
                    }


                    writeInterface.write(`${line}\n`);
                    entry.messages.filter((msg) => {
                        const msgKey = Object.keys(msg)[0];
                        if (line === msgKey) {
                            stringToWrite = Object.values(msg)[0];
                        }
                    });
                });

                readInterface.on('close', function () {
                    writeInterface.end();
                    unlink(oldFile, (err) => {
                        if (err) {
                            log.error(`Cannot delete ${oldFile}`);
                        }
                    });
                    resolve(true);
                });

                readInterface.on('error', function () {
                    log.error(`Error reading in ${oldFile}`);
                    reject(false);
                });

                writeInterface.on('error', function () {
                    log.error(`Error writing in ${newFile}`);
                });

                log.done(`${newFile} merged!`);
            });
        }

    };
};

