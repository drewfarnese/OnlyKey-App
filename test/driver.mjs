import webdriver from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Creates a single webdriver instance that is available for all tests. Also
// includes an `after` hook to properly shut it down.

function createDriver() {
    // Use chromedriver that comes with nwjs
    const service = new chrome.ServiceBuilder(path.join(path.dirname(require.resolve('nw')), 'nwjs', 'chromedriver'));

    // Point chromedriver to the nwjs app
    const options = new chrome.Options()
        .addArguments('nwapp=' + path.join(__dirname, '..', 'build'));

    return new webdriver.Builder()
        .forBrowser('chrome')
        .setChromeService(service)
        .setChromeOptions(options)
        .build();
}

const driver = createDriver();

after(function() {
    return driver.quit();
});

export default driver;

