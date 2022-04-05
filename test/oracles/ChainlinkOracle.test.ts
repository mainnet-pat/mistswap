import { ethers } from "hardhat";
import { expect } from "chai";
import { getBigNumber } from "../utilities";

const ether = ethers.utils.parseEther;
const uintmax = ethers.constants.MaxUint256;

describe("ChainlinkOracle", function () {
  before(async function () {
    this.ChainlinkAggregator = await ethers.getContractFactory("ChainlinkAggregator")
    this.ChainlinkOracleV2 = await ethers.getContractFactory("ChainlinkOracleV2")
    this.signers = await ethers.getSigners()
    this.alice = this.signers[0]
    this.bob = this.signers[1]
  })

  beforeEach(async function () {
    this.aggregator = await this.ChainlinkAggregator.deploy()
    this.chainlinkOracleV2 = await this.ChainlinkOracleV2.deploy()
  })

  it("should allow proper interaction with the aggregator", async function () {
    expect(await this.aggregator.latestAnswer()).to.be.equal(0);
    await this.aggregator.setLatestAnswer(42);
    expect(await this.aggregator.latestAnswer()).to.be.equal(42);
    await expect(this.aggregator.connect(this.bob).setLatestAnswer(24)).to.be.revertedWith("Ownable: caller is not the owner");
  })

  it("should interact with ChainlinkOraclev2", async function () {
    await this.aggregator.setLatestAnswer(42);
    const dataParameter = await this.chainlinkOracleV2.getDataParameter(this.aggregator.address, ethers.constants.AddressZero, getBigNumber(1,36))
    expect(dataParameter).to.be.equal(ethers.utils.defaultAbiCoder.encode(["address", "address", "uint256"], [this.aggregator.address, ethers.constants.AddressZero, getBigNumber(1,36)]))
    expect((await this.chainlinkOracleV2.peek(dataParameter))[1]).to.be.equal(42)
  })

  it.skip("LPChainlinkOracleV1 aggregator", async function () {
    //Deploy FakeTokens
    this.ReturnFalseERC20Mock = await ethers.getContractFactory("ReturnFalseERC20Mock");
    this.RevertingERC20Mock = await ethers.getContractFactory("RevertingERC20Mock");
    this.collateral = await this.ReturnFalseERC20Mock.deploy("Collateral", "C", 18, getBigNumber(1000000, 18));
    this.asset = await this.RevertingERC20Mock.deploy("Asset", "A", 18, getBigNumber(1000000, 18));
    await this.collateral.deployed();
    await this.asset.deployed();

    //Funding Bob Address
    await this.collateral.transfer(this.bob.address, getBigNumber(100000, 18))
    await this.asset.transfer(this.bob.address, getBigNumber(100000, 18))
    //Deploy UniswapV2Factory
    this.UniswapV2Factory = await ethers.getContractFactory("UniswapV2Factory")
    this.uniswapV2Factory = await this.UniswapV2Factory.deploy(this.alice.address);
    //Creating Pair
    const createPairTx = await this.uniswapV2Factory.createPair(this.collateral.address, this.asset.address)
    this.pair = (await createPairTx.wait()).events[0].args.pair

    //Deploy SushiSwapFactory
    this.SushiSwapFactory = await ethers.getContractFactory("SushiSwapFactoryMock");
    this.sushiSwapFactory = await this.SushiSwapFactory.deploy(this.alice.address)
    await this.sushiSwapFactory.deployed();

    //Attach Pair to SushiSwapPair
    this.SushiSwapPair = await ethers.getContractFactory("SushiSwapPairMock");
    this.sushiSwapPair = await this.SushiSwapPair.attach(this.pair)


    // BCH/MIST at 1/60000
    await this.collateral.transfer(this.sushiSwapPair.address, getBigNumber(60000, await this.collateral.decimals()))
    await this.asset.transfer(this.sushiSwapPair.address, getBigNumber(1, await this.asset.decimals()))

    //Mint SushiSwapPair
    await this.sushiSwapPair.mint(this.alice.address)

    // BCH/USD at 1/300 with 8 digits precision
    await this.aggregator.setLatestAnswer(300_00000000);
    this.LPETHChainlinkOracleV1 = await ethers.getContractFactory("LPETHChainlinkOracleV1");
    this.lpETHChainlinkOracleV1 = await this.LPETHChainlinkOracleV1.deploy(this.pair, this.aggregator.address);

    // wrong price
    expect(await this.lpETHChainlinkOracleV1.latestAnswer()).to.be.equals(346410161513775);
  })
})
