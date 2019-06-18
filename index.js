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
 * Provides application entry point
 *
 * @author Ricardo Proença <ricardo@taotesting.com>
 */

const log = require('./src/log');
const runner = require('./src/runner')();

(async function start() {
    try {
        log.title('TAO Merge Translations!');
        await runner.loadConfig();

        await runner.selectTaoInstance();
        await runner.selectExtension();
        await runner.selectLanguage();
        await runner.selectTranslationsFolder();

        await runner.selectSearchModeEndsWith();

        await runner.verifyLocalChanges();
        await runner.proceed();

        await runner.prepareMerge();

        await runner.createBranch();
        await runner.mergeTranslations();
        await runner.bumpVersion();
        await runner.commitAndPush();

        await runner.initialiseGithubClient();
        await runner.createPullRequest();

        log.done('Don\'t forget to delete the branch!\nBye, bye! See you next time!');
    } catch (error) {
        log.error(error);
    }
})();
