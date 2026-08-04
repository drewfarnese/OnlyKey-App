import webdriver from 'selenium-webdriver';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import driver from './driver.mjs';

const { By, until } = webdriver;

chai.use(chaiAsPromised);
const { expect } = chai;

// A first integration test. Mostly a proof of concept to show that Selenium,
// Mocha, and nwjs can work together.

describe('OnlyKey Configuration', function() {

    it('should start disconnected', function() {
        driver.navigate().refresh();
        driver.wait(until.titleIs('OnlyKey Configuration Wizard'));

        const disconnected = driver.findElement(By.id('disconnected-dialog'));
        return expect(disconnected.getAttribute('open')).to.eventually.equal('true');
    });

    it('should not show "working..." dialog', function() {
        driver.wait(until.titleIs('OnlyKey Configuration Wizard'));

        const working = driver.findElement(By.id('working-dialog'));
        return expect(working.getAttribute('open')).to.eventually.equal(null);
    });
});

