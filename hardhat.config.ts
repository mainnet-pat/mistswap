// hardhat.config.ts

import "dotenv/config"
import "@nomiclabs/hardhat-etherscan";
import "@nomiclabs/hardhat-waffle";
import "@nomiclabs/hardhat-ganache";
import "hardhat-abi-exporter"
import "hardhat-deploy"
import "hardhat-deploy-ethers"
import "hardhat-gas-reporter"
import "hardhat-spdx-license-identifier"
import "hardhat-typechain"
import "hardhat-watcher"
import "solidity-coverage"
import "./tasks"

import { HardhatUserConfig } from "hardhat/types"
import { removeConsoleLog } from "hardhat-preprocessor"
import { extendEnvironment, task } from "hardhat/config";

const accounts = [process.env.DEPLOYER_PRIVATE_KEY, process.env.DEV_PRIVATE_KEY]

task("accounts", "Prints the list of accounts", async (taskArgs, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

const config: HardhatUserConfig = {
  abiExporter: {
    path: "./abi",
    clear: false,
    flat: true,
    // only: [],
    // except: []
  },
  defaultNetwork: "hardhat",
  gasReporter: {
    coinmarketcap: process.env.COINMARKETCAP_API_KEY,
    currency: "USD",
    enabled: process.env.REPORT_GAS === "true",
    excludeContracts: ["contracts/mocks/", "contracts/libraries/"],
  },
  mocha: {
    timeout: 20000,
  },
  namedAccounts: {
    deployer: {
      default: 0,
    },
    dev: {
      // Default to 1
      default: 1,
      // dev address mainnet
      // 1: "",
    },
  },
  networks: {
    localhost: {
      live: false,
      saveDeployments: true,
      tags: ["local"],
    },
    hardhat: {
      forking: {
        enabled: process.env.FORKING === "true",
        url: `https://smartbch.fountainhead.cash/mainnet`,
        blockNumber: 639620,
      },
      live: false,
      saveDeployments: true,
      tags: ["test", "local"],
    },
    smartbch: {
      url: "https://smartbch.fountainhead.cash/mainnet",
      accounts,
      chainId: 10000,
      live: true,
      saveDeployments: true,
      gasMultiplier: 2,
    },
    "smartbch-amber": {
      url: "http://moeing.tech:8545",
      accounts,
      chainId: 10001,
      live: true,
      saveDeployments: true,
      tags: ["staging"],
      gasMultiplier: 2,
    },
  },
  paths: {
    artifacts: "artifacts",
    cache: "cache",
    deploy: "deploy",
    deployments: "deployments",
    imports: "imports",
    sources: "contracts",
    tests: "test",
  },
  preprocess: {
    eachLine: removeConsoleLog((bre) => bre.network.name !== "hardhat" && bre.network.name !== "localhost"),
  },
  solidity: {
    compilers: [
      {
        version: "0.6.12",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      {
        version: "0.8.11",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },
  spdxLicenseIdentifier: {
    overwrite: false,
    runOnCompile: true,
  },
  typechain: {
    outDir: "types",
    target: "ethers-v5",
  },
  watcher: {
    compile: {
      tasks: ["compile"],
      files: ["./contracts"],
      verbose: true,
    },
  },
}

// will force re-use of deployed contracts
// to redeploy remove artifact from deployments directory
extendEnvironment(hre => {
  const original = hre.deployments.deploy;
  hre.deployments.deploy = async function(name: string, options: any) {
    const contract = await (hre.ethers as any).getContractOrNull(name);
    if (contract) {
      console.log(name, "already deployead at", contract.address)
      contract.skipped = true
      contract.wait = async() => {}
      return contract;
    }
    return original(name, options);
  }
})

export default config
