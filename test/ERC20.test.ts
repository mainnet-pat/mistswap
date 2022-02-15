import { expect } from "chai";
import { Contract, ContractFactory } from "ethers";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

let ERCToken: ContractFactory;
let ercToken: Contract;

let accounts: SignerWithAddress[] | any;

let alice: SignerWithAddress;
let bob: SignerWithAddress;

describe("ERC20", function () {
    beforeEach(async function () {
        // Setup accounts
        accounts = await ethers.getSigners();
        alice = accounts[0];
        bob = accounts[1];

        ERCToken = await ethers.getContractFactory("ERC20Mock");
        ercToken = await ERCToken.deploy("ercToken", "ERC20ERCToken", 10000);
        await ercToken.deployed();
       
    })

    it("ERCToken balance to be 10000 after deployment", async () => {
        const ercTokenContractBalance = await ercToken.balanceOf(alice.address)
        expect(ercTokenContractBalance).to.equal(10000);
    });
    
    it("Succeeds in creating over 2^256 - 1 (max) tokens", async function () {
        // 2^256 - 1
        const tokenFactory = await ethers.getContractFactory("ERC20Mock");
        const tokenTest =  await tokenFactory.deploy(
            "tokenTest",
            "ERC20Mock",
            "115792089237316195423570985008687907853269984665640564039457584007913129639935"
        )
          
        expect(await tokenTest.totalSupply()).to.be.equal("115792089237316195423570985008687907853269984665640564039457584007913129639935")
    })

    describe("Transfer", function () {

        it("Returns true on success", async function () {
            expect(await ercToken.callStatic.transfer(bob.address, 10000)).to.be.true
        })

        it("Succeeds transfering 10000 tokens from deployer to alice", async function () {
            await expect(() => ercToken.transfer(bob.address, 10000)).to.changeTokenBalances(
                ercToken,
                [alice, bob],
                [-10000, 10000]
            )
        })

        it("Fails transfering 10001 tokens from alice to bob", async function () {
            await expect(ercToken.transfer(bob.address, 10001)).to.be.revertedWith("ERC20: transfer amount exceeds balance")
        })

        it("Succeeds for zero value transfer", async function () {
            await expect(() => ercToken.transfer(bob.address, 0)).to.changeTokenBalances(ercToken, [alice, bob], [-0, 0])
        })

        it("Emits Transfer event with expected arguments", async function () {
            await expect(ercToken.transfer(bob.address, 2666))
                .to.emit(ercToken, "Transfer")
                .withArgs(alice.address, bob.address, 2666)
        })

        it("Emits Transfer event with expected arguments for zero value transfer ", async function () {
            await expect(ercToken.transfer(bob.address, 0))
                .to.emit(ercToken, "Transfer")
                .withArgs(alice.address, bob.address, 0)
        })
    })

   
})