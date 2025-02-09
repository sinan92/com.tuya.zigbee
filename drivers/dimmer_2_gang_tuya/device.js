'use strict';

const { debug, Cluster } = require('zigbee-clusters');
const TuyaSpecificCluster = require('../../lib/TuyaSpecificCluster');
const TuyaSpecificClusterDevice = require("../../lib/TuyaSpecificClusterDevice");

Cluster.addCluster(TuyaSpecificCluster);

class dimmer_2_gang_tuya extends TuyaSpecificClusterDevice {

  async onNodeInit({ zclNode }) {
    
    this.printNode();
    debug(true);

    const { subDeviceId } = this.getData();
    this.log('Sub device ID:', subDeviceId);

    // Check if the device is a subdevice or the main device
    if (!this.isSubDevice()) {
      // Main device setup (first gang)
      await this._setupGang(zclNode, 1, 'first gang');
    }

    if (subDeviceId === 'secondGang') {
      // Setup second gang
      await this._setupGang(zclNode, 2, 'second gang');
    }

    // Listen for incoming DP reports from the device
    zclNode.endpoints[1].clusters.tuya.on("datapoint", value => this.processDatapoint(value));
  }

  async _setupGang(zclNode, endpoint, gangName) {
    // Read attributes for the specific endpoint
    await zclNode.endpoints[endpoint].clusters.basic.readAttributes('manufacturerName', 'zclVersion', 'appVersion', 'modelId', 'powerSource', 'attributeReportingStatus')
      .catch(err => {
        this.error(`Error when reading device attributes for ${gangName}`, err);
      });

    // Configure reporting for on/off cluster
    await zclNode.endpoints[endpoint].clusters.onOff.configureReporting({
      attributeId: 'onOff',
      minInterval: 0,
      maxInterval: 600,
      minChange: 1,
    }).catch(err => {
      this.error(`Failed to configure onOff reporting for ${gangName}`, err);
    });

    // Configure reporting for level control (brightness)
    await zclNode.endpoints[endpoint].clusters.levelControl.configureReporting({
      attributeId: 'currentLevel',
      minInterval: 0,
      maxInterval: 600,
      minChange: 1,
    }).catch(err => {
      this.error(`Failed to configure levelControl reporting for ${gangName}`, err);
    });

    // Register capability listeners for on/off and dim capabilities
    this.registerCapabilityListener('onoff', async (value) => {
      this.log(`onoff ${gangName}:`, value);
      await this.writeBool(endpoint * 2 - 1, value)
        .catch(err => {
          this.error(`Error when writing onOff for ${gangName}: `, err);
        });
    });

    this.registerCapabilityListener('dim', async (value) => {
      const brightness = Math.floor(value * 1000); // Scale to 0-1000
      this.log(`brightness ${gangName}:`, brightness);
      await this.writeData32(endpoint * 2, brightness)
        .catch(err => {
          this.error(`Error when writing brightness for ${gangName}: `, err);
        });
    });
  }

  // Process DP reports and update Homey accordingly
  async processDatapoint(data) {
    const dp = data.dp;
    const value = data.data;

    switch (dp) {
      case 1: // On/off for gang 1
        this.setCapabilityValue('onoff', value[0] === 1);
        break;
      case 2: // Dim level for gang 1
        this.setCapabilityValue('dim', value[0] / 1000);
        break;
      case 3: // On/off for gang 2
        this.setCapabilityValue('onoff', value[0] === 1);
        break;
      case 4: // Dim level for gang 2
        this.setCapabilityValue('dim', value[0] / 1000);
        break;
      default:
        this.debug('Unhandled DP:', dp, value);
    }
  }

  onDeleted() {
    this.log('2 Gang dimmer module removed');
  }

}

module.exports = dimmer_2_gang_tuya;
