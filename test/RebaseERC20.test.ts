import { ethers } from "hardhat";
import { expect } from "chai";
import { advanceBlockTo, getBigNumber, setMasterContractApproval } from "./utilities";

const ether = ethers.utils.parseEther;
const uintmax = ethers.constants.MaxUint256;

describe("BentoBox with rebase tokens", function () {
  before(async function () {
    this.signers = await ethers.getSigners();
    this.alice = this.signers[0];

    this.MasterChef = await ethers.getContractFactory("MasterChef");
    this.FlexUsd = await ethers.getContractFactory("FlexUSDImplV2");
  })

  beforeEach(async function () {
    this.flexUsd = await this.FlexUsd.deploy();
    await this.flexUsd.deployed();
    await this.flexUsd.initialize(0);
    await this.flexUsd.mint(this.alice.address, getBigNumber(100));
  })

  // for this test to work, replace in UniswapV2Library.sol:
  // acca68b46e4aa677641d8d20d81c9f4b252af83de62ff9e2fb58a9b648ee3537
  // with
  // 0d85cddde71812a9fd417dd7f9597eada582a919e9968b717ce26a64844a7f49
  // do not forget to change it back, afterwards
  it.skip("Should allow flexusd rebalance in a pool", async function() {
    this.Router = await ethers.getContractFactory("UniswapV2Router02");
    this.Factory = await ethers.getContractFactory("UniswapV2Factory");
    this.Pair = await ethers.getContractFactory("UniswapV2Pair");
    this.WETH = await ethers.getContractFactory("WETH9Mock");

    this.weth = await this.WETH.deploy();
    this.factory = await this.Factory.deploy(this.alice.address);
    this.router = await this.Router.deploy(this.factory.address, this.weth.address);
    await this.factory.createPair(this.flexUsd.address, this.weth.address);
    const pairAddress = await this.factory.getPair(this.flexUsd.address, this.weth.address);
    this.pair = this.Pair.attach(pairAddress);
    console.log(this.pair.address, await this.factory.pairCodeHash());

    await this.flexUsd.approve(this.router.address, uintmax);

    // flexusd/weth: add liquidity / mint LP tokens
    await this.router.addLiquidityETH(
      this.flexUsd.address,
      ether("25"),
      ether("25"),
      ether("25"),
      this.alice.address,
      uintmax,
      {value: ether("25")}
    );

    let [reserve0, reserve1] = await this.pair.getReserves();
    expect(reserve0).to.be.equal(ether("25"));
    expect(reserve1).to.be.equal(ether("25"));

    // rebase flexusd 10% up
    await this.flexUsd.setMultiplier(ether("1.1"));
    await this.pair.sync();
    [reserve0, reserve1] = await this.pair.getReserves();
    expect(reserve0).to.be.equal(ether("27.5"));
    expect(reserve1).to.be.equal(ether("25"));
  })

  it("Should fail flexusd rebalance in a bentobox", async function() {
    this.Router = await ethers.getContractFactory("UniswapV2Router02");
    this.Factory = await ethers.getContractFactory("UniswapV2Factory");
    this.Pair = await ethers.getContractFactory("UniswapV2Pair");
    this.WETH = await ethers.getContractFactory("WETH9Mock");

    this.weth = await this.WETH.deploy();
    this.factory = await this.Factory.deploy(this.alice.address);
    this.router = await this.Router.deploy(this.factory.address, this.weth.address);
    await this.factory.createPair(this.flexUsd.address, this.weth.address);
    const pairAddress = await this.factory.getPair(this.flexUsd.address, this.weth.address);
    this.pair = this.Pair.attach(pairAddress);

    this.BentoBoxV1 = await ethers.getContractFactory("BentoBoxV1");
    this.bentoBoxV1 = await this.BentoBoxV1.deploy(this.weth.address);

    await this.flexUsd.approve(this.bentoBoxV1.address, getBigNumber(1000));
    await this.bentoBoxV1.deposit(this.flexUsd.address, this.alice.address, this.alice.address, getBigNumber(100), 0);

    expect(await this.flexUsd.balanceOf(this.bentoBoxV1.address)).to.be.equal(getBigNumber(100));
    expect(await this.bentoBoxV1.balanceOf(this.flexUsd.address, this.alice.address)).to.be.equal(getBigNumber(100));

    await this.flexUsd.setMultiplier(ether("1.1"));

    expect(await this.flexUsd.balanceOf(this.bentoBoxV1.address)).to.be.equal(getBigNumber(110));
    expect(await this.bentoBoxV1.balanceOf(this.flexUsd.address, this.alice.address)).to.be.equal(getBigNumber(100));
    await expect(this.bentoBoxV1.withdraw(this.flexUsd.address, this.alice.address, this.alice.address, getBigNumber(110), 0)).to.be.reverted;
    await this.bentoBoxV1.withdraw(this.flexUsd.address, this.alice.address, this.alice.address, getBigNumber(100), 0);
    expect(await this.flexUsd.balanceOf(this.bentoBoxV1.address)).to.be.equal("10000000000000000001");
    expect(await this.flexUsd.balanceOf(this.alice.address)).to.be.equal("99999999999999999999");
  })

  it("Should allow flexusd rebalance in a sushibar", async function() {
    this.FlexUsdBar = await ethers.getContractFactory("SushiBar");
    this.flexUsdBar = await this.FlexUsdBar.deploy(this.flexUsd.address);

    expect(await this.flexUsd.balanceOf(this.alice.address)).to.be.equal(getBigNumber(100));

    await this.flexUsd.approve(this.flexUsdBar.address, getBigNumber(1000));
    await this.flexUsdBar.enter(getBigNumber(100));

    expect(await this.flexUsd.balanceOf(this.alice.address)).to.be.equal(getBigNumber(0));
    expect(await this.flexUsd.balanceOf(this.flexUsdBar.address)).to.be.equal(getBigNumber(100));

    await this.flexUsd.setMultiplier(ether("1.1"));

    await this.flexUsdBar.leave(getBigNumber(100));

    expect(await this.flexUsd.balanceOf(this.alice.address)).to.be.equal(getBigNumber(110));
    expect(await this.flexUsd.balanceOf(this.flexUsdBar.address)).to.be.equal(getBigNumber(0));
  })

  it("Should allow flexusdbar rebalance in a bentobox", async function() {
    this.FlexUsdBar = await ethers.getContractFactory("SushiBar");
    this.flexUsdBar = await this.FlexUsdBar.deploy(this.flexUsd.address);
    expect(await this.flexUsd.balanceOf(this.alice.address)).to.be.equal(getBigNumber(100));
    await this.flexUsd.approve(this.flexUsdBar.address, getBigNumber(1000));
    await this.flexUsdBar.enter(getBigNumber(100));

    this.Router = await ethers.getContractFactory("UniswapV2Router02");
    this.Factory = await ethers.getContractFactory("UniswapV2Factory");
    this.Pair = await ethers.getContractFactory("UniswapV2Pair");
    this.WETH = await ethers.getContractFactory("WETH9Mock");

    this.weth = await this.WETH.deploy();
    this.factory = await this.Factory.deploy(this.alice.address);
    this.router = await this.Router.deploy(this.factory.address, this.weth.address);
    await this.factory.createPair(this.flexUsdBar.address, this.weth.address);
    const pairAddress = await this.factory.getPair(this.flexUsdBar.address, this.weth.address);
    this.pair = this.Pair.attach(pairAddress);

    this.BentoBoxV1 = await ethers.getContractFactory("BentoBoxV1");
    this.bentoBoxV1 = await this.BentoBoxV1.deploy(this.weth.address);

    await this.flexUsdBar.approve(this.bentoBoxV1.address, getBigNumber(1000));
    await this.bentoBoxV1.deposit(this.flexUsdBar.address, this.alice.address, this.alice.address, getBigNumber(100), 0);

    expect(await this.flexUsdBar.balanceOf(this.bentoBoxV1.address)).to.be.equal(getBigNumber(100));
    expect(await this.bentoBoxV1.balanceOf(this.flexUsdBar.address, this.alice.address)).to.be.equal(getBigNumber(100));

    await this.flexUsd.setMultiplier(ether("1.1"));

    expect(await this.flexUsd.balanceOf(this.flexUsdBar.address)).to.be.equal(getBigNumber(110));
    expect(await this.flexUsdBar.balanceOf(this.bentoBoxV1.address)).to.be.equal(getBigNumber(100));
    expect(await this.bentoBoxV1.balanceOf(this.flexUsdBar.address, this.alice.address)).to.be.equal(getBigNumber(100));
    await expect(this.bentoBoxV1.withdraw(this.flexUsdBar.address, this.alice.address, this.alice.address, getBigNumber(110), 0)).to.be.reverted;
    await this.bentoBoxV1.withdraw(this.flexUsdBar.address, this.alice.address, this.alice.address, getBigNumber(100), 0);
    expect(await this.flexUsdBar.balanceOf(this.bentoBoxV1.address)).to.be.equal(getBigNumber(0));
    expect(await this.flexUsdBar.balanceOf(this.alice.address)).to.be.equal(getBigNumber(100));

    await this.flexUsdBar.leave(getBigNumber(100));
    expect(await this.flexUsdBar.balanceOf(this.alice.address)).to.be.equal(getBigNumber(0));
    expect(await this.flexUsd.balanceOf(this.alice.address)).to.be.equal(getBigNumber(110));
  })
})
