import { ethers } from "hardhat";
import { assert, expect } from "chai";
import {
    advanceTime,
    advanceTimeAndBlock,
    encodePrice,
    getBigNumber,
    roundBN,
} from "../utilities";
import { Contract, ContractFactory } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";


let accounts: SignerWithAddress[] | any;

let alice, bob, carol, fred: SignerWithAddress;
let alicePrivateKey, bobPrivateKey: string;

//Fake ERC20 Tokens
let ReturnFalseERC20Mock,RevertingERC20Mock : ContractFactory;
let collateral, asset: Contract;
const amountA = 5
const amountB = 10

//SushiSwapPair
let SushiSwapPair: ContractFactory;
let SushiSwapFactory: ContractFactory;
let sushiSwapPair: Contract;
let sushiSwapFactory: Contract;

//UniswapV2Factory
let UniswapV2Factory: ContractFactory;
let uniswapV2Factory: Contract;

//OracleF
let OracleF: ContractFactory;
let oracleF: Contract;

//OracleB
let OracleB: ContractFactory;
let oracleB: Contract;

//OracleB
let oracleData: any

let expectedPrice: any[];

let pair;


describe("SimpleSLPOracle", function () {
    beforeEach(async function () {
        // Setup accounts
        accounts = await ethers.getSigners();
        alice = accounts[0];
        bob = accounts[1];
        carol = accounts[2];
        fred = accounts[5]

        alicePrivateKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
        bobPrivateKey = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
        
        //Deploy FakeTokens
        ReturnFalseERC20Mock = await ethers.getContractFactory("ReturnFalseERC20Mock");
        RevertingERC20Mock = await ethers.getContractFactory("RevertingERC20Mock");
        collateral = await ReturnFalseERC20Mock.deploy("Collateral", "C", 18, getBigNumber(1000000, 18));
        asset = await RevertingERC20Mock.deploy("Asset", "A", 18, getBigNumber(1000000, 18));
        await collateral.deployed();
        await asset.deployed();

        //Funding Bob Address
        await collateral.transfer(bob.address, getBigNumber(1000, 18))
        await asset.transfer(bob.address, getBigNumber(1000, 8))
        //Funding Carol Address
        await collateral.transfer(carol.address, getBigNumber(1000, 18))
        await asset.transfer(carol.address, getBigNumber(1000, 8))
        //Funding Fred Address
        await collateral.transfer(fred.address, getBigNumber(1000, 18))
        await asset.transfer(fred.address, getBigNumber(1000, 8))

        //Deploy UniswapV2Factory
        UniswapV2Factory = await ethers.getContractFactory("UniswapV2Factory")
        uniswapV2Factory = await UniswapV2Factory.deploy(alice.address);
        //Creating Pair
        const createPairTx = await uniswapV2Factory.createPair(collateral.address, asset.address)
        pair = (await createPairTx.wait()).events[0].args.pair

        //Deploy SushiSwapFactory
        SushiSwapFactory = await ethers.getContractFactory("SushiSwapFactoryMock");
        sushiSwapFactory = await SushiSwapFactory.deploy(alice.address)
        await sushiSwapFactory.deployed();

        //Attach Pair to SushiSwapPair
        SushiSwapPair = await ethers.getContractFactory("SushiSwapPairMock");
        sushiSwapPair = await SushiSwapPair.attach(pair)
        
        //Adding Amount to Fake Tokens
        await collateral.transfer(sushiSwapPair.address, getBigNumber(amountA, await collateral.decimals()))
        await asset.transfer(sushiSwapPair.address, getBigNumber(amountB, await asset.decimals()))
        
        //Mint SushiSwapPair
        await sushiSwapPair.mint(alice.address)

        expectedPrice = encodePrice(getBigNumber(amountA), getBigNumber(amountB))

        if (asset.address == (await sushiSwapPair.token0())) {
            //Deploy TWAP 0
            OracleF = await ethers.getContractFactory("SimpleSLPTWAP0Oracle");
            oracleF = await OracleF.deploy()

            //Deploy TWAP 1
            OracleB = await ethers.getContractFactory("SimpleSLPTWAP1Oracle");
            oracleB = await OracleB.deploy()

            await oracleF.deployed()
            await oracleB.deployed()
        } else {
            //Deploy TWAP 1
            OracleF = await ethers.getContractFactory("SimpleSLPTWAP1Oracle");
            oracleF = await OracleF.deploy()

            //Deploy TWAP 0
            OracleB = await ethers.getContractFactory("SimpleSLPTWAP0Oracle");
            oracleB = await OracleB.deploy()

            await oracleF.deployed()
            await oracleB.deployed()
        }
        oracleData = await oracleF.getDataParameter(sushiSwapPair.address)
    })
    describe("forward oracle", function () {
        describe("name", function () {
            it("should get name", async function () {
                expect(await oracleF.name(oracleData)).to.be.equal("MistSwap TWAP")
                expect(await oracleB.name(oracleData)).to.be.equal("MistSwap TWAP")
            })
        })

        describe("symbol", function () {
            it("should get symbol", async function () {
                expect(await oracleF.symbol(oracleData)).to.be.equal("M")
                expect(await oracleB.symbol(oracleData)).to.be.equal("M")
            })
        })

        describe("peek", function () {
            it("should return false on first peek", async function () {
                expect((await oracleF.peek(oracleData))[1]).to.equal("0")
                expect((await oracleB.peek(oracleData))[1]).to.equal("0")
            })

            it("should get price even when time since last update is longer than period", async function () {
                const blockTimestamp = (await sushiSwapPair.getReserves())[2]

                await oracleF.get(oracleData)
                await oracleB.get(oracleData)
                await advanceTime(30)
                await oracleF.get(oracleData)
                await oracleB.get(oracleData)
                await advanceTime(271)
                await oracleF.get(oracleData)
                await oracleB.get(oracleData)

                let info = (await oracleF.pairs(sushiSwapPair.address)).priceAverage.toString()
                expect(info).to.be.equal(expectedPrice[1].toString())

                await advanceTimeAndBlock(301)

                expect((await oracleF.peek(oracleData))[1]).to.be.equal(getBigNumber(1).mul(5).div(10))
                expect(await oracleF.peekSpot(oracleData)).to.be.equal(getBigNumber(1).mul(5).div(10))
                await oracleB.peek(oracleData)
            })
        })

        describe("get", function () {
            it("should update and get prices within period", async function () {
                const blockTimestamp = (await sushiSwapPair.getReserves())[2]

                await oracleF.get(oracleData)
                await oracleB.get(oracleData)
                await advanceTime(30)
                await oracleF.get(oracleData)
                await oracleB.get(oracleData)
                await advanceTime(271)
                await oracleB.get(oracleData)
                await oracleB.get(oracleData)
                await oracleF.get(oracleData)
                await oracleF.get(oracleData)
                
                let info = (await oracleF.pairs(sushiSwapPair.address)).priceAverage.toString()
                console.log(info)
                expect(info).to.be.equal(expectedPrice[1].toString())
                expect((await oracleF.peek(oracleData))[1]).to.be.equal(getBigNumber(1).mul(5).div(10))
                await oracleB.peek(oracleData)
            })

            it("should update prices after swap", async function () {
                const blockTimestamp = (await sushiSwapPair.getReserves())[2]
                await oracleF.get(oracleData)
                await advanceTime(301)
                await oracleF.get(oracleData)

                const price0 = (await oracleF.peek(oracleData))[1]
                await collateral.transfer(sushiSwapPair.address, getBigNumber(5))
                await advanceTime(150)
                await sushiSwapPair.sync()
                await advanceTime(150)
                await oracleF.get(oracleData)
                const price1 = (await oracleF.peek(oracleData))[1]
                const price1spot = await oracleF.peekSpot(oracleData)
                
                expect(price0).to.be.equal(getBigNumber(1).mul(5).div(10))
                expect(roundBN(price1)).to.be.equal(roundBN(getBigNumber(1).mul(75).div(100)))
                expect(roundBN(price1spot)).to.be.equal(roundBN(getBigNumber(1)))
            })
        })

        it("Assigns name to MistSwap TWAP", async function () {
            expect(await oracleF.name(oracleData)).to.equal("MistSwap TWAP")
        })

        it("Assigns symbol to M", async function () {
            expect(await oracleF.symbol(oracleData)).to.equal("M")
        })
    })

    describe("backwards oracle", function () {})
})
